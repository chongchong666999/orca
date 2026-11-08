import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import { quoteStartupArg } from '../../shared/agent-launch/startup/tui-agent-startup-shell'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { resolveA5GameContextBinary } from './a5-game-context-binary'

export async function refreshCocosEditorMcpLauncher(binary?: string): Promise<string | null> {
  if (!getAppEnvironment().isPackaged()) {
    return binary ?? null
  }
  const target = binary ?? (await resolveA5GameContextBinary({}))
  if (!target || !path.isAbsolute(target)) {
    return null
  }
  // Windows keeps its executable entrypoint; a shell script cannot be spawned there as an MCP executable.
  if (process.platform === 'win32') {
    return target
  }
  const directory = path.join(getAppEnvironment().getPath('userData'), 'cocos-editor-runtime')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const launcher = path.join(directory, 'a5-game-context')
  writeFileAtomically(launcher, `#!/bin/sh\nexec ${quoteStartupArg(target, 'posix')} "$@"\n`, {
    mode: 0o700
  })
  return launcher
}
