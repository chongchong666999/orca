import { existsSync } from 'node:fs'
import { samePathEntry, splitPathEntries } from '../cli/cli-install-path-format'
import { writeWindowsUserPath } from '../cli/cli-privileged-processes'
import {
  invalidateWindowsUserPathRegistryCache,
  readFreshWindowsUserPathRegistry,
  type WindowsUserPathReadResult
} from '../cli/windows-user-path-registry'
import {
  A5_GAME_CONTEXT_COMMANDS,
  type A5GameContextCommandRegistration
} from './a5-game-context-command-registration'

/** `<install>\resources\<this>` holds only the a5-game-context launchers, so cocos-agent's own `orca` stays off PATH. */
export const WINDOWS_A5_GAME_CONTEXT_BIN = 'a5-game-context-bin'
const OUR_ENTRY = new RegExp(`[\\\\/]resources[\\\\/]${WINDOWS_A5_GAME_CONTEXT_BIN}[\\\\/]?$`, 'i')

/** Puts this install's launcher folder on the user PATH and drops the folders of installs that are gone. */
export async function addWindowsA5GameContextPathEntry(input: {
  directory: string
  readUserPath?: () => Promise<WindowsUserPathReadResult>
  writeUserPath?: (value: string) => Promise<void>
  environment?: NodeJS.ProcessEnv
  exists?: (directory: string) => boolean
}): Promise<A5GameContextCommandRegistration> {
  const current = await (input.readUserPath ?? readFreshWindowsUserPathRegistry)()
  if (current.state !== 'success') {
    // Why: PATH is read-modify-write; a failed read must not become a write of a partial PATH.
    throw new Error(`${current.detail} No PATH changes were made.`)
  }
  const exists = input.exists ?? existsSync
  const same = (entry: string): boolean =>
    samePathEntry(
      'win32',
      entry,
      input.directory,
      input.environment ?? process.env,
      current.expandable
    )
  const entries = splitPathEntries('win32', current.value)
  const next = entries.filter((entry) => same(entry) || !OUR_ENTRY.test(entry) || exists(entry))
  if (!next.some(same)) {
    next.push(input.directory)
  }
  if (next.length !== entries.length || next.some((entry, index) => entry !== entries[index])) {
    await (input.writeUserPath ?? writeWindowsUserPath)(next.join(';'))
    invalidateWindowsUserPathRegistryCache()
  }
  return {
    directory: input.directory,
    linked: [...A5_GAME_CONTEXT_COMMANDS],
    kept: [],
    shadowedBy: {},
    profile: null
  }
}
