import { readCocosEditorLifecycle } from './cocos-editor-lifecycle'
import { CocosEditorShutdown } from './cocos-editor-shutdown'
import type { CocosEditorServiceDeps } from './cocos-editor-service-deps'
export type { CocosEditorServiceDeps } from './cocos-editor-service-deps'
import type { ProcessResult } from '@orca/process-host/process-spec'
import type {
  CocosEditorFailureCode,
  CocosEditorOpenResult,
  CocosEditorRecord
} from '../../shared/cocos-agent/cocos-editor-types'
import {
  editorShutdownUrl,
  parseEditorOpenOutput,
  lastLine,
  isSameEditor
} from './cocos-editor-open-output'
import { findCocosEditorForWorkspace, resolveCocosProjectRoot } from './cocos-project-detection'
import { prepareBundledCocosSdk } from './cocos-editor-sdk'

const MAX_LIVE_EDITORS = 3
// Why: GitNexus waits up to 100 s for another starter's project lock, then up to 60 s for the editor to come up.
const OPEN_TIMEOUT_MS = 180_000
const MAX_FAILURE_MESSAGE_LENGTH = 500

function failure(code: CocosEditorFailureCode, message: string): CocosEditorOpenResult {
  return { ok: false, code, message: message.slice(0, MAX_FAILURE_MESSAGE_LENGTH) }
}

/** Opens and stops GitNexus Cocos editors through `a5-game-context editor open`, which owns their processes. */
export class CocosEditorService {
  private readonly editors = new Map<string, CocosEditorRecord>()
  private queue: Promise<void> = Promise.resolve()
  private readonly activationOrder = new Map<string, number>()
  private activationSequence = 0
  private activationRequest = 0
  /** Editors that acknowledged a stop but still answered when the settle time ran out, by project. */
  private readonly closingEditors = new Map<string, string>()
  private quitting = false

  private readonly shutdown: CocosEditorShutdown

  constructor(private readonly deps: CocosEditorServiceDeps) {
    this.shutdown = new CocosEditorShutdown(deps.fetch, deps.shutdownSettleMs)
  }

  setCloseHandlers(
    prepareClose: CocosEditorServiceDeps['prepareClose'],
    closeFailed: CocosEditorServiceDeps['closeFailed']
  ): void {
    this.deps.prepareClose = prepareClose
    this.deps.closeFailed = closeFailed
  }

  async open(projectPath: string, document?: string): Promise<CocosEditorOpenResult> {
    if (this.quitting) {
      return failure('stopping', 'cocos-agent is quitting.')
    }
    // Why: GitNexus reads any argument starting with "-" as an option.
    if (document !== undefined && (!document.trim() || document.startsWith('-'))) {
      return failure('invalid-document', `Not a document path: ${document}`)
    }
    return this.serialize(async () => {
      const projectRoot = await resolveCocosProjectRoot(projectPath)
      return projectRoot
        ? this.openEditor(projectRoot, document)
        : failure('not-cocos-project', `Could not resolve one Cocos project in ${projectPath}`)
    })
  }

  /** True once the editor stopped or had already exited; false keeps it listed so the stop can be retried. */
  async stop(projectPath: string, forQuit = false): Promise<boolean> {
    return this.serialize(async () => {
      const editor = await findCocosEditorForWorkspace(projectPath, this.list())
      return editor ? this.stopEditor(editor.projectRoot, false, forQuit) : false
    })
  }

  list(): CocosEditorRecord[] {
    return [...this.editors.values()]
  }

  /**
   * App quit: asks every editor this session started to shut down right away, without queueing behind opens in
   * flight; an open that finishes afterwards shuts down the editor it started. One that outlives the app anyway (the
   * open was still starting at exit) exits on GitNexus's own idle timeout, since no page connects to it.
   */
  shutdownForQuit(): void {
    this.quitting = true
    this.activationRequest++
    void this.deps.preview?.close()
    for (const record of this.editors.values()) {
      const shutdownUrl = record.startedByApp ? editorShutdownUrl(record.url) : null
      if (shutdownUrl) {
        void this.shutdown.post(shutdownUrl)
      }
    }
  }

  // Why: an open racing a stop would reuse the editor that is shutting down and hand out a dead URL.
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  async activate(projectPath: string | null): Promise<void> {
    const request = ++this.activationRequest
    this.deps.preview?.select(null)
    const editor = projectPath
      ? await findCocosEditorForWorkspace(projectPath, this.list())
      : undefined
    if (request !== this.activationRequest || this.quitting) {
      return
    }
    // Activation during an open must affect its next eviction decision immediately.
    if (editor && this.editors.has(editor.projectRoot)) {
      this.activationOrder.set(editor.projectRoot, ++this.activationSequence)
      this.deps.preview?.select(editor)
      await this.releaseIfExited(editor.projectRoot)
    }
  }

  /** GitNexus stops an editor no page used for 10 minutes; its tab is told so it reopens one instead of a dead address. */
  private async releaseIfExited(projectRoot: string): Promise<void> {
    const record = this.editors.get(projectRoot)
    if (!record || this.closingEditors.has(projectRoot)) {
      return
    }
    const lifecycle = await readCocosEditorLifecycle(record.url, this.deps.fetch)
    if (lifecycle === 'gone' && !this.quitting && this.editors.get(projectRoot) === record) {
      this.forget(record)
      this.deps.onEvicted?.(record)
    }
  }

  private forget(record: CocosEditorRecord): void {
    this.closingEditors.delete(record.projectRoot)
    this.editors.delete(record.projectRoot)
    this.deps.preview?.remove(record)
    this.activationOrder.delete(record.projectRoot)
  }

  private async makeRoom(): Promise<boolean> {
    if (this.editors.size < MAX_LIVE_EDITORS) {
      return true
    }
    const candidates = [...this.editors.values()].sort(
      (a, b) =>
        (this.activationOrder.get(a.projectRoot) ?? 0) -
        (this.activationOrder.get(b.projectRoot) ?? 0)
    )
    for (const record of candidates) {
      if (this.quitting) {
        return false
      }
      const closingOrigin = this.closingEditors.get(record.projectRoot)
      if (closingOrigin && (await this.shutdown.waitUntilClosed(closingOrigin))) {
        this.forget(record)
        this.deps.onEvicted?.(record)
        return true
      }
      if (closingOrigin) {
        continue
      }
      const activation = this.activationOrder.get(record.projectRoot)
      const lifecycle = await readCocosEditorLifecycle(record.url, this.deps.fetch)
      if (lifecycle === 'gone') {
        this.forget(record)
        this.deps.onEvicted?.(record)
        return true
      }
      if (lifecycle !== 'idle' || !record.startedByApp) {
        continue
      }
      if (activation !== this.activationOrder.get(record.projectRoot)) {
        continue
      }
      if (!(await this.stopEditor(record.projectRoot, true))) {
        continue
      }
      this.activationOrder.delete(record.projectRoot)
      this.deps.onEvicted?.(record)
      return true
    }
    return false
  }

  private async openEditor(projectRoot: string, document?: string): Promise<CocosEditorOpenResult> {
    if (this.quitting) {
      return failure('stopping', 'cocos-agent is quitting.')
    }
    // Why: the CLI would hand back the editor that acknowledged a stop but has not exited yet.
    const closingOrigin = this.closingEditors.get(projectRoot)
    if (closingOrigin !== undefined) {
      if (!(await this.shutdown.waitUntilClosed(closingOrigin))) {
        return failure('stopping', `The previous editor of ${projectRoot} is still shutting down.`)
      }
      this.closingEditors.delete(projectRoot)
      this.editors.delete(projectRoot)
    }
    const binary = await this.deps.resolveBinary()
    if (!binary) {
      return failure(
        'unavailable',
        'a5-game-context is not bundled with this build; set A5_GAME_CONTEXT_BIN in development.'
      )
    }
    if (!this.editors.has(projectRoot) && !(await this.makeRoom())) {
      return failure(
        'capacity',
        'All 3 Cocos editors are protected or still stopping. Save changes or stop an idle editor, then try again.'
      )
    }
    const args = ['editor', 'open', '--project', projectRoot]
    if (document) {
      args.push(document)
    }
    let result: ProcessResult
    try {
      await prepareBundledCocosSdk(binary)
      await this.deps.preview?.start()
      if (this.quitting) {
        return failure('stopping', 'cocos-agent is quitting.')
      }
      result = await this.deps.runProcess({
        program: binary,
        args,
        cwd: projectRoot,
        timeoutMs: OPEN_TIMEOUT_MS
      })
    } catch (error) {
      return failure('start-failed', error instanceof Error ? error.message : String(error))
    }
    if (result.timedOut) {
      return failure('timed-out', `The editor of ${projectRoot} did not start in time.`)
    }
    const output = result.code === 0 ? parseEditorOpenOutput(result.stdout) : null
    if (!output) {
      return failure(
        'start-failed',
        lastLine(result.stderr) || `a5-game-context exited with code ${String(result.code)}`
      )
    }
    if (this.quitting) {
      const shutdownUrl = output.reused ? null : editorShutdownUrl(output.url)
      if (shutdownUrl) {
        void this.shutdown.post(shutdownUrl)
      }
      return failure('stopping', 'cocos-agent is quitting.')
    }
    const previous = this.editors.get(projectRoot)
    const startedEarlierByApp =
      previous !== undefined && previous.startedByApp && isSameEditor(previous.url, output.url)
    this.editors.set(projectRoot, {
      projectRoot,
      url: output.url,
      startedByApp: startedEarlierByApp || !output.reused
    })
    this.activationOrder.set(projectRoot, ++this.activationSequence)
    return {
      ok: true,
      url: output.url,
      projectRoot,
      reused: output.reused,
      ...(this.deps.preview?.warning ? { previewWarning: this.deps.preview.warning } : {})
    }
  }

  private async stopEditor(
    projectRoot: string,
    onlyIdle = false,
    forQuit = false
  ): Promise<boolean> {
    const record = this.editors.get(projectRoot)
    if (!record || !record.startedByApp) {
      return false
    }
    const shutdownUrl = editorShutdownUrl(record.url)
    if (shutdownUrl === null) {
      this.editors.delete(projectRoot)
      return false
    }
    const url = new URL(shutdownUrl)
    if (onlyIdle) {
      url.searchParams.set('onlyIdle', '1')
    } else if (this.deps.prepareClose) {
      const choice = await this.deps.prepareClose(record, forQuit)
      if (choice === false) {
        return false
      }
      if (choice) {
        if (choice.action === 'keep') {
          if (!forQuit) {
            return false
          }
          record.startedByApp = false
          return true
        }
        url.searchParams.set('action', choice.action)
        url.searchParams.set('revision', choice.revision)
      }
    }
    const outcome = await this.shutdown.request(url.toString())
    if (outcome === 'closed') {
      this.deps.preview?.remove(record)
      this.editors.delete(projectRoot)
      this.closingEditors.delete(projectRoot)
    } else if (outcome === 'closing') {
      this.closingEditors.set(projectRoot, new URL(shutdownUrl).origin)
    }
    if (outcome !== 'closed' && !onlyIdle) {
      const keep = await this.deps.closeFailed?.(outcome, forQuit)
      if (forQuit && keep) {
        record.startedByApp = false
        return true
      }
    }
    return outcome === 'closed'
  }
}
