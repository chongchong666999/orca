import path from 'node:path'
import { runProcess } from '@orca/process-host'
import { bundledA5GameContextLauncher } from './a5-game-context-binary'

let preparation: Promise<void> | undefined

export function prepareBundledCocosSdk(binary: string): Promise<void> {
  const resources = process.resourcesPath
  if (!resources || binary !== bundledA5GameContextLauncher(resources)) {
    return Promise.resolve()
  }
  preparation ??= runProcess({
    program: process.execPath,
    args: [
      path.join(resources, 'cocos-agent', 'prepare-editor.cjs'),
      path.join(resources, 'a5-game-context')
    ],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: undefined },
    timeoutMs: 120_000
  })
    .then((result) => {
      if (result.code !== 0 || result.timedOut) {
        throw new Error(result.stderr.trim() || 'Could not prepare the bundled Cocos SDK.')
      }
    })
    .catch((error: unknown) => {
      preparation = undefined
      throw error
    })
  return preparation
}
