import { constants } from 'node:fs'
import {
  access,
  appendFile,
  lstat,
  mkdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink
} from 'node:fs/promises'
import path from 'node:path'
import { isExecutableFile, splitPathEntries } from '../cli/cli-install-path-format'
import {
  A5_GAME_CONTEXT_COMMANDS,
  type A5GameContextCommandRegistration
} from './a5-game-context-command-registration'

export const PROFILE_PATH_MARKER =
  '# Added by cocos-agent: its a5-game-context and cocos-cli commands.'

/** User-owned bin folders a command may go to without an administrator, by convention. */
function userCommandDirectories(home: string): string[] {
  return [
    path.join(home, '.local', 'bin'),
    path.join(home, 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ]
}

async function writableDirectory(directory: string): Promise<boolean> {
  try {
    if (!(await lstat(directory)).isDirectory()) {
      return false
    }
    await access(directory, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** `own`: a link any cocos-agent made, to an app's bundled launcher of that name (this app moved or another copy). */
async function entryState(file: string, name: string): Promise<'absent' | 'own' | 'foreign'> {
  try {
    if (!(await lstat(file)).isSymbolicLink()) {
      return 'foreign'
    }
  } catch {
    return 'absent'
  }
  const target = await readlink(file)
  return target.endsWith(`.app/Contents/Resources/bin/${name}`) ? 'own' : 'foreign'
}

async function linkCommand(directory: string, name: string, target: string): Promise<boolean> {
  const file = path.join(directory, name)
  const state = await entryState(file, name)
  if (state === 'foreign') {
    return false
  }
  if (state === 'own' && (await readlink(file)) === target) {
    return true
  }
  // Why: rename swaps the link in one step, so a shell never finds the command missing.
  const pending = path.join(directory, `.${name}.cocos-agent-${process.pid}`)
  await rm(pending, { force: true })
  await symlink(target, pending)
  await rename(pending, file)
  return true
}

async function firstOnPath(name: string, entries: string[]): Promise<string | null> {
  for (const entry of entries) {
    const file = path.join(entry, name)
    if (await isExecutableFile(file)) {
      return file
    }
  }
  return null
}

/** Adds `~/.local/bin` to the login shell's PATH once; null for a shell whose profile we do not know. */
async function addProfilePathLine(
  home: string,
  loginShell: string | undefined
): Promise<string | null> {
  const shell = path.basename(loginShell ?? '/bin/zsh')
  const profile =
    shell === 'zsh'
      ? path.join(home, '.zprofile')
      : shell === 'bash'
        ? path.join(home, '.bash_profile')
        : null
  if (!profile) {
    return null
  }
  const current = await readFile(profile, 'utf8').catch(() => '')
  if (!current.includes(PROFILE_PATH_MARKER)) {
    const separator = current === '' || current.endsWith('\n') ? '' : '\n'
    await appendFile(
      profile,
      `${separator}${PROFILE_PATH_MARKER}\nexport PATH="$HOME/.local/bin:$PATH"\n`
    )
  }
  return profile
}

/**
 * Links this app's bundled a5-game-context and cocos-cli into the first user-owned bin folder on the
 * login PATH (else `~/.local/bin`, put on PATH by the login profile), replacing only links cocos-agent made.
 */
export async function linkMacA5GameContextCommands(input: {
  launcherDirectory: string
  loginPath: string
  homeDirectory: string
  loginShell?: string
}): Promise<A5GameContextCommandRegistration> {
  const entries = splitPathEntries('darwin', input.loginPath).map((entry) =>
    path.resolve(entry.replace(/^~(?=$|\/)/, input.homeDirectory))
  )
  const candidates = new Set(userCommandDirectories(input.homeDirectory))
  let directory: string | null = null
  for (const entry of entries) {
    if (candidates.has(entry) && (await writableDirectory(entry))) {
      directory = entry
      break
    }
  }
  let profile: string | null = null
  if (!directory) {
    directory = path.join(input.homeDirectory, '.local', 'bin')
    await mkdir(directory, { recursive: true })
    profile = await addProfilePathLine(input.homeDirectory, input.loginShell)
  }
  const result: A5GameContextCommandRegistration = {
    directory,
    linked: [],
    kept: [],
    shadowedBy: {},
    profile
  }
  for (const name of A5_GAME_CONTEXT_COMMANDS) {
    if (!(await linkCommand(directory, name, path.join(input.launcherDirectory, name)))) {
      result.kept.push(name)
      continue
    }
    result.linked.push(name)
    const found = profile ? null : await firstOnPath(name, entries)
    if (found && found !== path.join(directory, name)) {
      result.shadowedBy[name] = found
    }
  }
  return result
}
