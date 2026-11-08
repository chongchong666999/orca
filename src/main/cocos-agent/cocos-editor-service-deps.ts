import type { ProcessResult, ProcessSpec } from '@orca/process-host/process-spec'
import type { CocosEditorRecord } from '../../shared/cocos-agent/cocos-editor-types'
import type { CocosEditorCloseChoice } from './cocos-editor-close'
import type { CocosPreviewRouter } from './cocos-preview-router'

export type CocosEditorServiceDeps = {
  resolveBinary: () => Promise<string | null>
  runProcess: (spec: ProcessSpec) => Promise<ProcessResult>
  fetch: typeof fetch
  onEvicted?: (record: CocosEditorRecord) => void
  shutdownSettleMs?: number
  prepareClose?: (
    record: CocosEditorRecord,
    forQuit?: boolean
  ) => Promise<CocosEditorCloseChoice | false | undefined>
  closeFailed?: (detail: string, forQuit?: boolean) => Promise<boolean | void>
  preview?: Pick<CocosPreviewRouter, 'start' | 'select' | 'remove' | 'close' | 'warning'>
}
