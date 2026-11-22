import { runProcess } from '@orca/process-host'
import type { CocosEditorRecord } from '../../shared/cocos-agent/cocos-editor-types'
import { resolveA5GameContextBinary } from './a5-game-context-binary'
import { CocosEditorService } from './cocos-editor-service'
import { runCocosEditorProcess } from './cocos-editor-process'
import { CocosPreviewRouter } from './cocos-preview-router'

const evictionListeners = new Set<(record: CocosEditorRecord) => void>()

export function onCocosEditorEvicted(listener: (record: CocosEditorRecord) => void): () => void {
  evictionListeners.add(listener)
  return () => {
    evictionListeners.delete(listener)
  }
}

/** The app's editors: the a5-game-context it resolves and the processes that starts. */
export const cocosEditorService = new CocosEditorService({
  preview: new CocosPreviewRouter((input, init) => fetch(input, init)),
  onEvicted: (record) => evictionListeners.forEach((listener) => listener(record)),
  resolveBinary: () => resolveA5GameContextBinary(),
  runProcess: (spec) =>
    process.platform === 'win32' ? runCocosEditorProcess(spec) : runProcess(spec),
  fetch: (input, init) => fetch(input, init)
})
