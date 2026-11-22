import type {
  CocosEditorRecord,
  CocosStopAllFailure,
  CocosStopAllResult
} from '../../shared/cocos-agent/cocos-editor-types'
import { prepareCocosEditorClose } from './cocos-editor-close'
import { editorShutdownUrl, isSameEditor } from './cocos-editor-open-output'
import type { CocosEditorService } from './cocos-editor-service'
import { CocosEditorShutdown } from './cocos-editor-shutdown'

type HandOffDeps = {
  prepareClose: typeof prepareCocosEditorClose
  shutdown: Pick<CocosEditorShutdown, 'request'>
}

/** An editor another program started (an agent's MCP tools, the CLI), with `preset` answering its unsaved changes. */
async function stopExternalEditor(
  record: CocosEditorRecord,
  preset: 'save' | 'discard' | undefined,
  deps: HandOffDeps
): Promise<CocosStopAllFailure['reason'] | 'closed'> {
  const shutdownUrl = editorShutdownUrl(record.url)
  if (!shutdownUrl) {
    return 'refused'
  }
  const url = new URL(shutdownUrl)
  const choice = await deps.prepareClose(record, false, preset)
  if (choice === false || choice?.action === 'keep') {
    return 'cancelled'
  }
  if (choice) {
    url.searchParams.set('action', choice.action)
    url.searchParams.set('revision', choice.revision)
  }
  return deps.shutdown.request(url.toString())
}

/**
 * Stop all Cocos services, so Cocos Creator can take the projects back: every editor the app knows, whoever started
 * it, then `others` that run elsewhere. `preset` answers unsaved changes for all of them.
 */
export async function stopAllCocosServices(
  service: Pick<CocosEditorService, 'list' | 'stop'>,
  others: CocosEditorRecord[],
  preset: 'save' | 'discard' | undefined,
  deps: HandOffDeps = {
    prepareClose: prepareCocosEditorClose,
    shutdown: new CocosEditorShutdown((input, init) => fetch(input, init))
  }
): Promise<CocosStopAllResult> {
  const result: CocosStopAllResult = { stopped: [], failed: [] }
  const known = service.list()
  for (const record of known) {
    if (await service.stop(record.projectRoot, false, { preset })) {
      result.stopped.push(record)
    } else {
      result.failed.push({ projectRoot: record.projectRoot, reason: 'refused' })
    }
  }
  for (const record of others.filter(
    (other) => !known.some((item) => isSameEditor(item.url, other.url))
  )) {
    const outcome = await stopExternalEditor(record, preset, deps)
    if (outcome === 'closed') {
      result.stopped.push(record)
    } else {
      result.failed.push({ projectRoot: record.projectRoot, reason: outcome })
    }
  }
  return result
}
