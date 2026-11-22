import type { ProcessResult, ProcessSpec } from '@orca/process-host/process-spec'
import type { CocosEditorRecord } from '../../shared/cocos-agent/cocos-editor-types'
import type { CocosEditorCloseChoice } from './cocos-editor-close'

export type CocosEditorServiceDeps = {
  resolveBinary: () => Promise<string | null>
  runProcess: (spec: ProcessSpec) => Promise<ProcessResult>
  fetch: typeof fetch
  onEvicted?: (record: CocosEditorRecord) => void
  shutdownSettleMs?: number
  prepareClose?: (
    record: CocosEditorRecord,
    forQuit?: boolean,
    preset?: 'save' | 'discard'
  ) => Promise<CocosEditorCloseChoice | false | undefined>
  closeFailed?: (outcome: 'closing' | 'refused', forQuit?: boolean) => Promise<boolean | void>
}
