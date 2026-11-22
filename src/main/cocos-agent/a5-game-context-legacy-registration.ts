import { lstat, readlink, rm } from 'node:fs/promises'
import path from 'node:path'
import { isCocosAgentAppLink } from './a5-game-context-toolchain-probe'
import { removeWindowsA5GameContextPathEntries } from './a5-game-context-windows-user-path'

const COMMANDS = ['a5-game-context', 'cocos-cli'] as const

/** The bin folders cocos-agent 0.1.2 and earlier linked its launchers into. */
function legacyLinkFolders(home: string): string[] {
  return [
    path.join(home, '.local', 'bin'),
    path.join(home, 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ]
}

/**
 * Undoes cocos-agent's own command registration from before the npm global install took over: on macOS the links to
 * an app's `Contents/Resources/bin`, on Windows the launcher folder on the user PATH. Links others made stay.
 */
export async function removeLegacyA5GameContextRegistration(
  platform: NodeJS.Platform,
  home: string
): Promise<void> {
  if (platform === 'win32') {
    await removeWindowsA5GameContextPathEntries()
    return
  }
  for (const folder of legacyLinkFolders(home)) {
    for (const name of COMMANDS) {
      const link = path.join(folder, name)
      const isLink = await lstat(link).then(
        (stats) => stats.isSymbolicLink(),
        () => false
      )
      if (isLink && isCocosAgentAppLink(await readlink(link).catch(() => ''), name)) {
        await rm(link, { force: true })
      }
    }
  }
}
