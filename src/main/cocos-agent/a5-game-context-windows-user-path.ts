import { splitPathEntries } from '../cli/command-paths/cli-install-path-format'
import { writeWindowsUserPath } from '../cli/installation/cli-privileged-processes'
import {
  invalidateWindowsUserPathRegistryCache,
  readFreshWindowsUserPathRegistry,
  type WindowsUserPathReadResult
} from '../cli/command-paths/windows-user-path-registry'

/** `<install>\resources\<this>` holds only the a5-game-context launchers, so cocos-agent's own `orca` stays off PATH. */
export const WINDOWS_A5_GAME_CONTEXT_BIN = 'a5-game-context-bin'
const OUR_ENTRY = new RegExp(`[\\\\/]resources[\\\\/]${WINDOWS_A5_GAME_CONTEXT_BIN}[\\\\/]?$`, 'i')

/**
 * cocos-agent 0.1.2 and earlier put their launcher folder on the user PATH; npm's own global folder serves the
 * commands now, so every such entry, of any install, comes off.
 */
export async function removeWindowsA5GameContextPathEntries(
  input: {
    readUserPath?: () => Promise<WindowsUserPathReadResult>
    writeUserPath?: (value: string) => Promise<void>
  } = {}
): Promise<void> {
  const current = await (input.readUserPath ?? readFreshWindowsUserPathRegistry)()
  if (current.state !== 'success') {
    // Why: PATH is read-modify-write; a failed read must not become a write of a partial PATH.
    throw new Error(`${current.detail} No PATH changes were made.`)
  }
  const entries = splitPathEntries('win32', current.value)
  const next = entries.filter((entry) => !OUR_ENTRY.test(entry))
  if (next.length !== entries.length) {
    await (input.writeUserPath ?? writeWindowsUserPath)(next.join(';'))
    invalidateWindowsUserPathRegistryCache()
  }
}
