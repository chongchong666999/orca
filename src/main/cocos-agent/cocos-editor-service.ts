import { readCocosEditorLifecycle } from './cocos-editor-lifecycle'
import { CocosEditorShutdown } from './cocos-editor-shutdown'
import type { CocosEditorServiceDeps } from './cocos-editor-service-deps'
export type { CocosEditorServiceDeps } from './cocos-editor-service-deps'
import type { ProcessResult } from '@orca/process-host/process-spec'
import type {
  CocosEditorOpenResult,
  CocosEditorRecord
} from '../../shared/cocos-agent/cocos-editor-types'
import {
  editorShutdownUrl,
  editorOpenFailure as failure,
  parseEditorOpenOutput,
  lastLine,
  isSameEditor
} from './cocos-editor-open-output'
import { findCocosEditorForWorkspace, resolveCocosProjectRoot } from './cocos-project-detection'
import { prepareBundledCocosSdk } from './cocos-editor-sdk'
import { findRunningCocosEditor } from './cocos-editor-running-services'

const MAX_LIVE_EDITORS = 3
// Why: GitNexus waits up to 100 s for another starter's project lock, then up to 60 s for the editor to come up.
const OPEN_TIMEOUT_MS = 180_000

/** Opens and stops GitNexus Cocos editors through `a5-game-context editor open`, which owns their processes. */
export class CocosEditorService {
  private readonly editors = new Map<string, CocosEditorRecord>()
  private queue: Promise<void> = Promise.resolve()
  private readonly activationOrder = new Map<string, number>()
  private activationSequence = 0
  private activationRequest = 0
  private activeProjectPath: string | null = null
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
        ? this.openEditor(projectRoot, document).finally(() => this.releasePreviewIfEmpty())
        : failure('not-cocos-project', `Could not resolve one Cocos project in ${projectPath}`)
    })
  }

  /**
   * True once the editor stopped or had already exited; false keeps it listed so the stop can be retried. `handOff`
   * (Stop all Cocos services) stops it whoever started it, with `preset` answering unsaved changes.
   */
  async stop(
    projectPath: string,
    forQuit = false,
    handOff?: { preset?: 'save' | 'discard' }
  ): Promise<boolean> {
    return this.serialize(async () => {
      const editor = await findCocosEditorForWorkspace(projectPath, this.list())
      this.activationRequest++
      const stopped = editor && (await this.stopEditor(editor.projectRoot, false, forQuit, handOff))
      await this.releasePreviewIfEmpty()
      return stopped === true
    })
  }

  list(): CocosEditorRecord[] {
    return [...this.editors.values()]
  }

  /** Quit bypasses queued opens; opens finishing afterwards shut down their own editor. */
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
    const done = () => undefined
    this.queue = result.then(done, done)
    return result
  }

  async activate(projectPath: string | null): Promise<void> {
    const request = ++this.activationRequest
    if (this.activeProjectPath !== projectPath) {
      this.deps.preview?.select(null)
      this.activeProjectPath = projectPath
    }
    const editor = projectPath
      ? ((await findCocosEditorForWorkspace(projectPath, this.list())) ??
        (await findRunningCocosEditor(projectPath, this.deps.fetch)))
      : undefined
    if (request !== this.activationRequest || this.quitting) {
      return
    }
    if (editor && !this.editors.has(editor.projectRoot)) {
      this.editors.set(editor.projectRoot, editor)
    }
    // Activation during an open must affect its next eviction decision immediately.
    if (
      !editor ||
      this.editors.get(editor.projectRoot) !== editor ||
      this.closingEditors.has(editor.projectRoot)
    ) {
      this.deps.preview?.select(null)
      return
    }
    this.activationOrder.set(editor.projectRoot, ++this.activationSequence)
    this.deps.preview?.select(editor)
    await this.deps.preview?.start()
    await this.releaseIfExited(editor)
  }

  /** GitNexus stops an editor no page used for 10 minutes; its tab is told so it reopens one instead of a dead address. */
  private async releaseIfExited(record: CocosEditorRecord): Promise<void> {
    const lifecycle = await readCocosEditorLifecycle(record.url, this.deps.fetch)
    if (
      lifecycle === 'gone' &&
      !this.quitting &&
      this.editors.get(record.projectRoot) === record &&
      !this.closingEditors.has(record.projectRoot)
    ) {
      this.forget(record, true)
      await this.serialize(() => this.releasePreviewIfEmpty())
    }
  }

  private forget(record: CocosEditorRecord, notify = false): void {
    this.closingEditors.delete(record.projectRoot)
    this.editors.delete(record.projectRoot)
    this.activationOrder.delete(record.projectRoot)
    this.deps.preview?.remove(record)
    if (notify) {
      this.deps.onEvicted?.(record)
    }
  }

  private async releasePreviewIfEmpty(): Promise<void> {
    if (![...this.editors.keys()].some((root) => !this.closingEditors.has(root))) {
      await this.deps.preview?.close()
    }
  }

  private async makeRoom(): Promise<boolean> {
    if (this.editors.size < MAX_LIVE_EDITORS) {
      return true
    }
    const order = (r: CocosEditorRecord): number => this.activationOrder.get(r.projectRoot) ?? 0
    const candidates = [...this.editors.values()].sort((a, b) => order(a) - order(b))
    for (const record of candidates) {
      if (this.quitting) {
        return false
      }
      const closingOrigin = this.closingEditors.get(record.projectRoot)
      if (closingOrigin) {
        if (await this.shutdown.waitUntilClosed(closingOrigin)) {
          this.forget(record, true)
          return true
        }
        continue
      }
      const activation = this.activationOrder.get(record.projectRoot)
      const lifecycle = await readCocosEditorLifecycle(record.url, this.deps.fetch)
      if (lifecycle === 'gone') {
        this.forget(record, true)
        return true
      }
      if (
        lifecycle !== 'idle' ||
        !record.startedByApp ||
        activation !== this.activationOrder.get(record.projectRoot)
      ) {
        continue
      }
      if (await this.stopEditor(record.projectRoot, true)) {
        this.deps.onEvicted?.(record)
        return true
      }
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
    const args = ['editor', 'open', '--project', projectRoot, ...(document ? [document] : [])]
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
    const startedByApp =
      !output.reused || Boolean(previous?.startedByApp && isSameEditor(previous.url, output.url))
    const record = { projectRoot, url: output.url, startedByApp }
    this.editors.set(projectRoot, record)
    this.activationOrder.set(projectRoot, ++this.activationSequence)
    if (
      this.editors.size === 1 ||
      (this.activeProjectPath &&
        (await findCocosEditorForWorkspace(this.activeProjectPath, [record])))
    ) {
      this.deps.preview?.select(record)
    }
    return { ok: true, url: output.url, projectRoot, reused: output.reused }
  }

  private async stopEditor(
    projectRoot: string,
    onlyIdle = false,
    forQuit = false,
    handOff?: { preset?: 'save' | 'discard' }
  ): Promise<boolean> {
    const record = this.editors.get(projectRoot)
    if (!record || (!record.startedByApp && !handOff)) {
      return false
    }
    const shutdownUrl = editorShutdownUrl(record.url)
    if (shutdownUrl === null) {
      this.forget(record)
      return false
    }
    const outcome = await this.shutdown.requestEditor(record, shutdownUrl, {
      onlyIdle,
      forQuit,
      preset: handOff?.preset,
      prepareClose: this.deps.prepareClose
    })
    if (outcome === 'keep') {
      record.startedByApp = false
      return true
    }
    if (outcome === 'closed') {
      this.forget(record)
    } else if (outcome === 'closing') {
      this.closingEditors.set(projectRoot, new URL(shutdownUrl).origin)
      this.deps.preview?.remove(record)
    }
    if ((outcome === 'refused' || outcome === 'closing') && !onlyIdle) {
      if ((await this.deps.closeFailed?.(outcome, forQuit)) && forQuit) {
        record.startedByApp = false
        return true
      }
    }
    return outcome === 'closed'
  }
}
