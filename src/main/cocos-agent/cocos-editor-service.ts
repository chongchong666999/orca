import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { runProcess } from '@orca/process-host'
import type { ProcessResult, ProcessSpec } from '@orca/process-host/process-spec'
import type {
  CocosEditorFailureCode,
  CocosEditorOpenResult,
  CocosEditorRecord
} from '../../shared/cocos-agent/cocos-editor-types'
import { resolveA5GameContextBinary } from './a5-game-context-binary'
import { editorShutdownUrl, parseEditorOpenOutput } from './cocos-editor-open-output'
import { detectCocosProject } from './cocos-project-detection'

// Why: GitNexus waits up to 100 s for another starter's project lock, then up to 60 s for the editor to come up.
const OPEN_TIMEOUT_MS = 180_000
const SHUTDOWN_TIMEOUT_MS = 3_000
const SHUTDOWN_SETTLE_MS = 5_000
const SHUTDOWN_PROBE_INTERVAL_MS = 100
const MAX_FAILURE_MESSAGE_LENGTH = 500

export type CocosEditorServiceDeps = {
  resolveBinary: () => Promise<string | null>
  runProcess: (spec: ProcessSpec) => Promise<ProcessResult>
  fetch: typeof fetch
  shutdownSettleMs?: number
}

function failure(code: CocosEditorFailureCode, message: string): CocosEditorOpenResult {
  return { ok: false, code, message: message.slice(0, MAX_FAILURE_MESSAGE_LENGTH) }
}

function lastLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .findLast(Boolean) ?? ''
  )
}

// Why: GitNexus keys its one-editor-per-project records by the canonical path.
async function canonicalPath(target: string): Promise<string> {
  return realpath(target).catch(() => path.resolve(target))
}

function isSameEditor(a: string, b: string): boolean {
  const shutdownA = editorShutdownUrl(a)
  return shutdownA !== null && shutdownA === editorShutdownUrl(b)
}

type ShutdownOutcome = 'closed' | 'closing' | 'refused'

function connectionErrorCode(error: unknown): unknown {
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined
  return cause?.code
}

/** Opens and stops GitNexus Cocos editors through `a5-game-context editor open`, which owns their processes. */
export class CocosEditorService {
  private readonly editors = new Map<string, CocosEditorRecord>()
  private readonly projectQueues = new Map<string, Promise<void>>()
  /** Editors that acknowledged a stop but still answered when the settle time ran out, by project. */
  private readonly closingEditors = new Map<string, string>()

  constructor(private readonly deps: CocosEditorServiceDeps) {}

  async open(projectPath: string, document?: string): Promise<CocosEditorOpenResult> {
    // Why: GitNexus reads any argument starting with "-" as an option.
    if (document !== undefined && (!document.trim() || document.startsWith('-'))) {
      return failure('invalid-document', `Not a document path: ${document}`)
    }
    const projectRoot = await canonicalPath(projectPath)
    return this.serialize(projectRoot, () => this.openEditor(projectRoot, document))
  }

  /** True once the editor stopped or had already exited; false keeps it listed so the stop can be retried. */
  async stop(projectPath: string): Promise<boolean> {
    const projectRoot = await canonicalPath(projectPath)
    return this.serialize(projectRoot, () => this.stopEditor(projectRoot))
  }

  list(): CocosEditorRecord[] {
    return [...this.editors.values()]
  }

  // Why: an open racing a stop would reuse the editor that is shutting down and hand out a dead URL.
  private serialize<T>(projectRoot: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.projectQueues.get(projectRoot) ?? Promise.resolve()
    const result = previous.then(operation)
    const settled = result.then(
      () => undefined,
      () => undefined
    )
    this.projectQueues.set(projectRoot, settled)
    void settled.then(() => {
      if (this.projectQueues.get(projectRoot) === settled) {
        this.projectQueues.delete(projectRoot)
      }
    })
    return result
  }

  private async openEditor(projectRoot: string, document?: string): Promise<CocosEditorOpenResult> {
    // Why: the CLI would hand back the editor that acknowledged a stop but has not exited yet.
    const closingOrigin = this.closingEditors.get(projectRoot)
    if (closingOrigin !== undefined) {
      if (!(await this.waitUntilClosed(closingOrigin))) {
        return failure('stopping', `The previous editor of ${projectRoot} is still shutting down.`)
      }
      this.closingEditors.delete(projectRoot)
      this.editors.delete(projectRoot)
    }
    if ((await detectCocosProject(projectRoot)).kind !== 'cocos') {
      return failure('not-cocos-project', `${projectRoot} has no project.json and assets folder`)
    }
    const binary = await this.deps.resolveBinary()
    if (!binary) {
      return failure(
        'unavailable',
        'a5-game-context is not bundled with this build; set A5_GAME_CONTEXT_BIN in development.'
      )
    }
    const args = ['editor', 'open', '--project', projectRoot]
    if (document) {
      args.push(document)
    }
    let result: ProcessResult
    try {
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
    const previous = this.editors.get(projectRoot)
    const startedEarlierByApp =
      previous !== undefined && previous.startedByApp && isSameEditor(previous.url, output.url)
    this.editors.set(projectRoot, {
      projectRoot,
      url: output.url,
      startedByApp: startedEarlierByApp || !output.reused
    })
    return { ok: true, url: output.url, projectRoot, reused: output.reused }
  }

  private async stopEditor(projectRoot: string): Promise<boolean> {
    const record = this.editors.get(projectRoot)
    if (!record) {
      return false
    }
    const shutdownUrl = editorShutdownUrl(record.url)
    if (shutdownUrl === null) {
      this.editors.delete(projectRoot)
      return false
    }
    const outcome = await this.requestShutdown(shutdownUrl)
    if (outcome === 'closed') {
      this.editors.delete(projectRoot)
      this.closingEditors.delete(projectRoot)
    } else if (outcome === 'closing') {
      this.closingEditors.set(projectRoot, new URL(shutdownUrl).origin)
    }
    return outcome === 'closed'
  }

  private async requestShutdown(shutdownUrl: string): Promise<ShutdownOutcome> {
    try {
      const response = await this.deps.fetch(shutdownUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(SHUTDOWN_TIMEOUT_MS)
      })
      await response.body?.cancel().catch(() => undefined)
      if (!response.ok) {
        return 'refused'
      }
    } catch (error) {
      // Why: nothing listening means the editor already exited (idle exit, or stopped elsewhere).
      return connectionErrorCode(error) === 'ECONNREFUSED' ? 'closed' : 'refused'
    }
    return (await this.waitUntilClosed(new URL(shutdownUrl).origin)) ? 'closed' : 'closing'
  }

  /** True once nothing answers at `origin`; false if it still answers when the settle time runs out. */
  private async waitUntilClosed(origin: string): Promise<boolean> {
    const deadline = Date.now() + (this.deps.shutdownSettleMs ?? SHUTDOWN_SETTLE_MS)
    while (Date.now() < deadline) {
      try {
        const response = await this.deps.fetch(origin, {
          method: 'HEAD',
          signal: AbortSignal.timeout(SHUTDOWN_PROBE_INTERVAL_MS * 5)
        })
        await response.body?.cancel().catch(() => undefined)
      } catch (error) {
        const code = connectionErrorCode(error)
        if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
          return true
        }
      }
      await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_PROBE_INTERVAL_MS))
    }
    return false
  }
}

export const cocosEditorService = new CocosEditorService({
  resolveBinary: () => resolveA5GameContextBinary(),
  runProcess: (spec) => runProcess(spec),
  fetch: (input, init) => fetch(input, init)
})
