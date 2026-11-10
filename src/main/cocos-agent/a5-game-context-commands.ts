import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import { isExecutableFile } from '../cli/cli-install-path-format'
import { hostShellEnvironment } from '../runtime/structured-agent-shell-environment'
import type { A5GameContextCommandRegistration } from './a5-game-context-command-registration'
import { linkMacA5GameContextCommands } from './a5-game-context-mac-command-links'
import {
  addWindowsA5GameContextPathEntry,
  WINDOWS_A5_GAME_CONTEXT_BIN
} from './a5-game-context-windows-user-path'

/** Makes this install's bundled a5-game-context and cocos-cli the ones every terminal finds; runs at each packaged launch. */
export async function registerA5GameContextCommands(
  resourcesPath: string | undefined = process.resourcesPath
): Promise<A5GameContextCommandRegistration | null> {
  if (!getAppEnvironment().isPackaged() || !resourcesPath) {
    return null
  }
  if (process.platform === 'darwin') {
    // Why: a translocated or mounted copy moves or goes away, and links to it would break with it.
    if (resourcesPath.includes('/AppTranslocation/') || resourcesPath.startsWith('/Volumes/')) {
      return null
    }
    const launcherDirectory = path.join(resourcesPath, 'bin')
    if (!(await isExecutableFile(path.join(launcherDirectory, 'a5-game-context')))) {
      return null
    }
    const env = await hostShellEnvironment()
    return linkMacA5GameContextCommands({
      launcherDirectory,
      loginPath: env.PATH ?? '',
      homeDirectory: homedir(),
      loginShell: env.SHELL
    })
  }
  if (process.platform === 'win32') {
    const directory = path.join(resourcesPath, WINDOWS_A5_GAME_CONTEXT_BIN)
    if (!existsSync(path.join(directory, 'a5-game-context.cmd'))) {
      return null
    }
    return addWindowsA5GameContextPathEntry({ directory })
  }
  return null
}

export function reportA5GameContextCommands(result: A5GameContextCommandRegistration | null): void {
  if (!result?.directory) {
    return
  }
  for (const name of result.kept) {
    console.warn(
      `[cocos-agent] ${path.join(result.directory, name)} is not cocos-agent's; left it in place`
    )
  }
  for (const [name, file] of Object.entries(result.shadowedBy)) {
    console.warn(
      `[cocos-agent] ${name} on PATH is ${file}, not the bundled one in ${result.directory}`
    )
  }
  if (result.profile) {
    console.info(`[cocos-agent] added ${result.directory} to PATH in ${result.profile}`)
  }
}
