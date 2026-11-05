import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ProcessResult, ProcessSpec } from '@orca/process-host/process-spec'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CocosEditorService } from './cocos-editor-service'

function processResult(overrides: Partial<ProcessResult>): ProcessResult {
  return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false, ...overrides }
}

function openOutput(projectRoot: string, running: boolean): ProcessResult {
  return processResult({
    stdout: JSON.stringify({
      event: 'open',
      url: 'http://127.0.0.1:40000/?token=t1',
      project: projectRoot,
      running
    })
  })
}

const refused = (): Error => new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })

/** POST /shutdown answers with `shutdown`; the probe after it finds nothing listening. */
function editorFetch(shutdown: () => Promise<Response>): typeof fetch {
  return vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
    init?.method === 'POST' ? shutdown() : Promise.reject(refused())
  )
}

describe('CocosEditorService', () => {
  let projectRoot: string

  beforeEach(() => {
    projectRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'cocos-editor-service-')))
    mkdirSync(path.join(projectRoot, 'assets'))
    writeFileSync(path.join(projectRoot, 'project.json'), '{"version":"2.4.13"}')
  })

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  it('opens through `editor open --project` and stops through the reported editor', async () => {
    const runProcess = vi.fn(async (_spec: ProcessSpec) => openOutput(projectRoot, false))
    const fetch = editorFetch(async () => new Response('{"stopping":true}'))
    const service = new CocosEditorService({
      resolveBinary: async () => '/opt/a5-game-context',
      runProcess,
      fetch
    })

    await expect(service.open(projectRoot)).resolves.toEqual({
      ok: true,
      url: 'http://127.0.0.1:40000/?token=t1',
      projectRoot,
      reused: false
    })
    expect(runProcess.mock.calls[0][0]).toMatchObject({
      program: '/opt/a5-game-context',
      args: ['editor', 'open', '--project', projectRoot]
    })
    expect(service.list()).toEqual([
      { projectRoot, url: 'http://127.0.0.1:40000/?token=t1', startedByApp: true }
    ])

    await expect(service.stop(projectRoot)).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:40000/shutdown?token=t1',
      expect.objectContaining({ method: 'POST' })
    )
    expect(service.list()).toEqual([])
  })

  it('keeps the editor listed when the shutdown is refused', async () => {
    const service = new CocosEditorService({
      resolveBinary: async () => '/opt/a5-game-context',
      runProcess: async () => openOutput(projectRoot, true),
      fetch: editorFetch(async () => new Response('busy', { status: 503 }))
    })
    await service.open(projectRoot)

    await expect(service.stop(projectRoot)).resolves.toBe(false)
    expect(service.list()).toEqual([
      { projectRoot, url: 'http://127.0.0.1:40000/?token=t1', startedByApp: false }
    ])
  })

  it('starts an open only after a stop in flight for the same project finishes', async () => {
    let acknowledge: ((response: Response) => void) | null = null
    const runProcess = vi.fn(async (_spec: ProcessSpec) => openOutput(projectRoot, false))
    const service = new CocosEditorService({
      resolveBinary: async () => '/opt/a5-game-context',
      runProcess,
      fetch: editorFetch(() => new Promise<Response>((resolve) => (acknowledge = resolve)))
    })
    await service.open(projectRoot)

    const stopping = service.stop(projectRoot)
    const reopening = service.open(projectRoot)
    await vi.waitFor(() => expect(acknowledge).not.toBeNull())
    expect(runProcess).toHaveBeenCalledTimes(1)

    acknowledge!(new Response('{"stopping":true}'))
    await expect(stopping).resolves.toBe(true)
    await expect(reopening).resolves.toMatchObject({ ok: true })
    expect(runProcess).toHaveBeenCalledTimes(2)
  })

  it('keeps an editor that acknowledged the stop but still answers, and will not reopen it', async () => {
    const runProcess = vi.fn(async (_spec: ProcessSpec) => openOutput(projectRoot, false))
    const service = new CocosEditorService({
      resolveBinary: async () => '/opt/a5-game-context',
      runProcess,
      fetch: vi.fn(async () => new Response('{"stopping":true}')),
      shutdownSettleMs: 30
    })
    await service.open(projectRoot)

    await expect(service.stop(projectRoot)).resolves.toBe(false)
    expect(service.list()).toHaveLength(1)
    await expect(service.open(projectRoot)).resolves.toMatchObject({ ok: false, code: 'stopping' })
    expect(runProcess).toHaveBeenCalledTimes(1)
  })

  it('reports the editor error without spawning for option-like documents', async () => {
    const runProcess = vi.fn(async (_spec: ProcessSpec) =>
      processResult({ code: 1, stderr: 'native engine failed: EDITOR_START_FAILED: boom\n' })
    )
    const service = new CocosEditorService({
      resolveBinary: async () => '/opt/a5-game-context',
      runProcess,
      fetch: vi.fn()
    })

    await expect(service.open(projectRoot, '--web')).resolves.toMatchObject({
      ok: false,
      code: 'invalid-document'
    })
    expect(runProcess).not.toHaveBeenCalled()
    await expect(service.open(projectRoot)).resolves.toEqual({
      ok: false,
      code: 'start-failed',
      message: 'native engine failed: EDITOR_START_FAILED: boom'
    })
  })
})
