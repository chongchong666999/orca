import { chmod, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { linkMacA5GameContextCommands } from './a5-game-context-mac-command-links'

let work = ''
afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

async function executable(file: string, text = '#!/bin/sh\n'): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, text)
  await chmod(file, 0o755)
}

async function bundledLaunchers(): Promise<string> {
  const launchers = path.join(work, 'new', 'cocos-agent-beta.app', 'Contents', 'Resources', 'bin')
  await executable(path.join(launchers, 'a5-game-context'))
  await executable(path.join(launchers, 'cocos-cli'))
  return launchers
}

it.skipIf(process.platform === 'win32')(
  'links into the first user bin folder on the login PATH, refreshes an older cocos-agent link and keeps other commands',
  async () => {
    work = await mkdtemp(path.join(os.tmpdir(), 'a5-commands-'))
    const home = path.join(work, 'home')
    const npmBin = path.join(work, 'npm', 'bin')
    const localBin = path.join(home, '.local', 'bin')
    await mkdir(path.join(home, 'bin'), { recursive: true })
    await executable(path.join(npmBin, 'a5-game-context'))
    await executable(path.join(localBin, 'cocos-cli'), '#!/bin/sh\necho mine\n')
    await symlink(
      path.join(
        work,
        'old',
        'cocos-agent-beta.app',
        'Contents',
        'Resources',
        'bin',
        'a5-game-context'
      ),
      path.join(localBin, 'a5-game-context')
    )
    const launchers = await bundledLaunchers()

    const result = await linkMacA5GameContextCommands({
      launcherDirectory: launchers,
      loginPath: [npmBin, '~/.local/bin', path.join(home, 'bin')].join(':'),
      homeDirectory: home
    })

    expect(result).toEqual({
      directory: localBin,
      linked: ['a5-game-context'],
      kept: ['cocos-cli'],
      shadowedBy: { 'a5-game-context': path.join(npmBin, 'a5-game-context') },
      profile: null
    })
    expect(await readlink(path.join(localBin, 'a5-game-context'))).toBe(
      path.join(
        work,
        'new',
        'cocos-agent-beta.app',
        'Contents',
        'Resources',
        'bin',
        'a5-game-context'
      )
    )
    expect(await readFile(path.join(localBin, 'cocos-cli'), 'utf8')).toBe('#!/bin/sh\necho mine\n')
  }
)

it.skipIf(process.platform === 'win32')(
  'falls back to ~/.local/bin and puts it on the zsh login PATH once when no user bin folder is on PATH',
  async () => {
    work = await mkdtemp(path.join(os.tmpdir(), 'a5-commands-'))
    const home = path.join(work, 'home')
    await mkdir(home)
    await writeFile(path.join(home, '.zprofile'), 'export FOO=1')
    const launchers = await bundledLaunchers()
    const input = {
      launcherDirectory: launchers,
      loginPath: path.join(work, 'elsewhere'),
      homeDirectory: home,
      loginShell: '/bin/zsh'
    }

    await linkMacA5GameContextCommands(input)
    const result = await linkMacA5GameContextCommands(input)

    expect(result.directory).toBe(path.join(home, '.local', 'bin'))
    expect(result.linked).toEqual(['a5-game-context', 'cocos-cli'])
    expect(result.profile).toBe(path.join(home, '.zprofile'))
    expect(await readFile(path.join(home, '.zprofile'), 'utf8')).toBe(
      'export FOO=1\n# Added by cocos-agent: its a5-game-context and cocos-cli commands.\nexport PATH="$HOME/.local/bin:$PATH"\n'
    )
    expect(await readlink(path.join(home, '.local', 'bin', 'cocos-cli'))).toBe(
      path.join(launchers, 'cocos-cli')
    )
  }
)
