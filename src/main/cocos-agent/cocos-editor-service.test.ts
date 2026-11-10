import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ProcessResult, ProcessSpec } from '@orca/process-host/process-spec'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CocosEditorService } from './cocos-editor-service'
import { detectCocosProject } from './cocos-project-detection'

function processResult(overrides: Partial<ProcessResult>): ProcessResult {
  return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false, ...overrides }
}

function openOutput(
  projectRoot: string,
  running: boolean,
  url = 'http://127.0.0.1:40000/?token=t1'
): ProcessResult {
  return processResult({
    stdout: JSON.stringify({ event: 'open', url, project: projectRoot, running })
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

  it('detects, opens and stops the single Cocos project inside a repository root', async () => {
    const workspace = path.join(projectRoot, 'workspace')
    const nestedProject = path.join(workspace, 'AsiaPoker')
    mkdirSync(path.join(nestedProject, 'assets'), { recursive: true })
    writeFileSync(path.join(nestedProject, 'project.json'), '{"version":"2.4.13"}')
    const runProcess = vi.fn(async (_spec: ProcessSpec) => openOutput(nestedProject, false))
    const service = new CocosEditorService({
      resolveBinary: async () => '/opt/a5-game-context',
      runProcess,
      fetch: editorFetch(async () => new Response('{"stopping":true}'))
    })

    await expect(detectCocosProject(workspace)).resolves.toEqual({
      kind: 'cocos',
      creatorVersion: '2.4.13'
    })
    await expect(service.open(workspace, 'assets/Entry.fire')).resolves.toMatchObject({
      ok: true,
      projectRoot: nestedProject
    })
    expect(runProcess.mock.calls[0][0]).toMatchObject({
      cwd: nestedProject,
      args: ['editor', 'open', '--project', nestedProject, 'assets/Entry.fire']
    })
    await expect(service.stop(workspace)).resolves.toBe(true)
    expect(service.list()).toEqual([])
  })

  it('does not select an arbitrary Cocos project from a multi-project repository', async () => {
    const workspace = path.join(projectRoot, 'workspace')
    for (const name of ['FirstGame', 'SecondGame']) {
      const child = path.join(workspace, name)
      mkdirSync(path.join(child, 'assets'), { recursive: true })
      writeFileSync(path.join(child, 'project.json'), '{"version":"2.4.13"}')
    }
    const runProcess = vi.fn(async (_spec: ProcessSpec) => openOutput(projectRoot, false))
    const service = new CocosEditorService({
      resolveBinary: async () => '/opt/a5-game-context',
      runProcess,
      fetch: editorFetch(async () => new Response('{"stopping":true}'))
    })
    await expect(detectCocosProject(workspace)).resolves.toEqual({ kind: 'not-cocos' })
    await expect(service.open(workspace)).resolves.toMatchObject({
      ok: false,
      code: 'not-cocos-project'
    })
    expect(runProcess).not.toHaveBeenCalled()
  })

  it('keeps unsaved work open when closing is cancelled', async () => {
    const fetch = editorFetch(async () => new Response('{"stopping":true}'))
    const service = new CocosEditorService({
      resolveBinary: async () => '/opt/a5-game-context',
      runProcess: async () => openOutput(projectRoot, false),
      fetch,
      prepareClose: async () => false
    })
    await service.open(projectRoot)
    await expect(service.stop(projectRoot)).resolves.toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(service.list()).toHaveLength(1)
  })

  it('keeps the editor open when its confirmed discard revision is refused', async () => {
    const closeFailed = vi.fn(async () => {})
    const fetch = editorFetch(
      async () => new Response('{"error":"EDITOR_CLOSE_CHANGED"}', { status: 409 })
    )
    const service = new CocosEditorService({
      resolveBinary: async () => '/opt/a5-game-context',
      runProcess: async () => openOutput(projectRoot, false),
      fetch,
      prepareClose: async () => ({ action: 'discard', revision: 'inspected-revision' }),
      closeFailed
    })
    await service.open(projectRoot)
    await expect(service.stop(projectRoot)).resolves.toBe(false)
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:40000/shutdown?token=t1&action=discard&revision=inspected-revision',
      expect.objectContaining({ method: 'POST' })
    )
    expect(service.list()).toHaveLength(1)
    expect(closeFailed).toHaveBeenCalledOnce()
  })

  it('lets quit retain an unreachable editor without sending a shutdown request', async () => {
    const fetch = vi.fn(async () => new Response(''))
    const service = new CocosEditorService({
      resolveBinary: async () => '/opt/a5-game-context',
      runProcess: async () => openOutput(projectRoot, false),
      fetch,
      prepareClose: async () => ({ action: 'keep' })
    })
    await service.open(projectRoot)
    fetch.mockClear()
    expect(await service.stop(projectRoot, true)).toBe(true)
    expect(service.list()[0].startedByApp).toBe(false)
    service.shutdownForQuit()
    expect(fetch).not.toHaveBeenCalled()
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

  it('on quit asks started editors to stop at once and stops one whose open finishes later', async () => {
    let finishSecondOpen: ((result: ProcessResult) => void) | null = null
    const runProcess = vi
      .fn<(spec: ProcessSpec) => Promise<ProcessResult>>()
      .mockResolvedValueOnce(openOutput(projectRoot, false))
      .mockImplementationOnce(() => new Promise((resolve) => (finishSecondOpen = resolve)))
    const fetch = editorFetch(async () => new Response('{"stopping":true}'))
    const service = new CocosEditorService({
      resolveBinary: async () => '/opt/a5-game-context',
      runProcess,
      fetch
    })
    await service.open(projectRoot)
    const secondOpen = service.open(projectRoot)
    await vi.waitFor(() => expect(finishSecondOpen).not.toBeNull())

    service.shutdownForQuit()
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:40000/shutdown?token=t1',
      expect.objectContaining({ method: 'POST' })
    )

    finishSecondOpen!(openOutput(projectRoot, false, 'http://127.0.0.1:40001/?token=t2'))
    await expect(secondOpen).resolves.toMatchObject({ ok: false, code: 'stopping' })
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:40001/shutdown?token=t2',
      expect.objectContaining({ method: 'POST' })
    )
    await expect(service.open(projectRoot)).resolves.toMatchObject({ ok: false, code: 'stopping' })
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

  function budgetFixture() {
    const roots = ['a', 'b', 'c', 'd', 'e'].map((name) => {
      const root = path.join(projectRoot, name)
      mkdirSync(path.join(root, 'assets'), { recursive: true })
      writeFileSync(path.join(root, 'project.json'), '{"version":"2.4.13"}')
      return root
    })
    const live = new Set<string>()
    const protectedRoots = new Map<string, unknown>()
    const refusedStops = new Set<string>()
    const delayedStops = new Set<string>()
    const externalRoots = new Set<string>()
    const evicted: string[] = []
    const stops: string[] = []
    const runProcess = vi.fn(async (spec: ProcessSpec) => {
      const root = spec.cwd
      if (typeof root !== 'string') {
        throw new Error('Expected a project working directory')
      }
      const reused = live.has(root) || externalRoots.has(root)
      live.add(root)
      expect(live.size).toBeLessThanOrEqual(3)
      return openOutput(
        root,
        reused,
        `http://127.0.0.1:${41000 + roots.indexOf(root)}/?token=secret`
      )
    })
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      const root = roots[Number(url.port) - 41000]
      if (!live.has(root)) {
        throw refused()
      }
      if (init?.method === 'HEAD') {
        return new Response('live')
      }
      expect(url.searchParams.get('token')).toBe('secret')
      if (url.pathname === '/editor/lifecycle') {
        const state = protectedRoots.get(root) ?? { dirty: false, busy: false }
        if (state === 'failed') {
          throw new Error('network unavailable')
        }
        return Response.json(state)
      }
      expect(url.pathname).toBe('/shutdown')
      expect(url.searchParams.get('onlyIdle')).toBe('1')
      stops.push(root)
      if (refusedStops.has(root)) {
        return new Response('busy', { status: 409 })
      }
      if (!delayedStops.has(root)) {
        live.delete(root)
      }
      return new Response('stopping')
    })
    const service = new CocosEditorService({
      resolveBinary: async () => '/opt/a5-game-context',
      runProcess,
      fetch,
      shutdownSettleMs: 1,
      onEvicted: (record) => evicted.push(record.projectRoot)
    })
    return {
      service,
      roots,
      live,
      protectedRoots,
      refusedStops,
      delayedStops,
      externalRoots,
      evicted,
      stops,
      runProcess
    }
  }

  it('serializes concurrent opens globally and evicts the oldest idle editor before the fourth starts', async () => {
    const { service, roots, evicted, live } = budgetFixture()
    const results = await Promise.all(roots.slice(0, 4).map((root) => service.open(root)))
    expect(results.every((result) => result.ok)).toBe(true)
    expect(evicted).toEqual([roots[0]])
    expect([...live]).toEqual([roots[1], roots[2], roots[3]])
    expect(service.list()).toHaveLength(3)
  })

  it('uses activation LRU and can reopen a suspended project within the same budget', async () => {
    const { service, roots, evicted } = budgetFixture()
    for (const root of roots.slice(0, 3)) {
      await service.open(root)
    }
    await service.activate(roots[0])
    await expect(service.open(roots[3])).resolves.toMatchObject({ ok: true })
    expect(evicted).toEqual([roots[1]])
    await expect(service.open(roots[1])).resolves.toMatchObject({ ok: true, reused: false })
    expect(evicted).toEqual([roots[1], roots[2]])
    expect(service.list()).toHaveLength(3)
  })

  it('releases an editor that exited on its own when its workspace is activated', async () => {
    const { service, roots, live, evicted } = budgetFixture()
    await service.open(roots[0])
    await service.open(roots[1])
    live.delete(roots[0])
    await service.activate(roots[1])
    expect(evicted).toEqual([])
    await service.activate(roots[0])
    expect(evicted).toEqual([roots[0]])
    expect(service.list().map((record) => record.projectRoot)).toEqual([roots[1]])
  })

  it('protects dirty, busy and unknown lifecycle states with an explicit capacity error', async () => {
    const { service, roots, protectedRoots, stops, runProcess } = budgetFixture()
    for (const root of roots.slice(0, 3)) {
      await service.open(root)
    }
    protectedRoots.set(roots[0], { dirty: true, busy: false })
    protectedRoots.set(roots[1], { dirty: false, busy: true })
    protectedRoots.set(roots[2], {})
    await expect(service.open(roots[3])).resolves.toMatchObject({ ok: false, code: 'capacity' })
    expect(stops).toEqual([])
    expect(runProcess).toHaveBeenCalledTimes(3)
    expect(service.list()).toHaveLength(3)
  })

  it('never evicts failed checks or external instances and does not explicitly stop an external editor', async () => {
    const { service, roots, externalRoots, protectedRoots, stops } = budgetFixture()
    externalRoots.add(roots[0])
    for (const root of roots.slice(0, 3)) {
      await service.open(root)
    }
    protectedRoots.set(roots[1], 'failed')
    protectedRoots.set(roots[2], { dirty: false })
    await expect(service.open(roots[3])).resolves.toMatchObject({ ok: false, code: 'capacity' })
    await expect(service.stop(roots[0])).resolves.toBe(false)
    expect(stops).toEqual([])
    expect(service.list()).toHaveLength(3)
  })

  it('counts refused and acknowledged-but-live stops until their processes actually exit', async () => {
    const { service, roots, refusedStops, delayedStops, protectedRoots, live, evicted } =
      budgetFixture()
    for (const root of roots.slice(0, 3)) {
      await service.open(root)
    }
    refusedStops.add(roots[0])
    delayedStops.add(roots[1])
    protectedRoots.set(roots[2], { dirty: true, busy: false })
    await expect(service.open(roots[3])).resolves.toMatchObject({ ok: false, code: 'capacity' })
    expect(service.list()).toHaveLength(3)
    expect(evicted).toEqual([])
    live.delete(roots[1])
    await expect(service.open(roots[3])).resolves.toMatchObject({ ok: true })
    expect(evicted).toEqual([roots[1]])
    expect(service.list()).toHaveLength(3)
  })

  it('cancels globally queued opens on quit while cleaning up the open already in flight', async () => {
    let finish!: (result: ProcessResult) => void
    const runProcess = vi
      .fn<(spec: ProcessSpec) => Promise<ProcessResult>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
    const fetch = editorFetch(async () => new Response('stopping'))
    const service = new CocosEditorService({
      resolveBinary: async () => '/opt/a5-game-context',
      runProcess,
      fetch
    })
    const first = service.open(projectRoot)
    const queued = service.open(projectRoot)
    await vi.waitFor(() => expect(finish).toBeDefined())
    service.shutdownForQuit()
    finish(openOutput(projectRoot, false))
    await expect(first).resolves.toMatchObject({ ok: false, code: 'stopping' })
    await expect(queued).resolves.toMatchObject({ ok: false, code: 'stopping' })
    expect(runProcess).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:40000/shutdown?token=t1',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it.each([false, true])(
    'releases a connection-refused dead record without stopping other protected editors (external=%s)',
    async (external) => {
      const { service, roots, live, protectedRoots, externalRoots, stops, evicted } =
        budgetFixture()
      if (external) {
        externalRoots.add(roots[0])
      }
      for (const root of roots.slice(0, 3)) {
        await service.open(root)
      }
      live.delete(roots[0])
      protectedRoots.set(roots[1], { dirty: true, busy: false })
      protectedRoots.set(roots[2], { dirty: false, busy: true })
      await expect(service.open(roots[3])).resolves.toMatchObject({ ok: true })
      expect(stops).toEqual([])
      expect(evicted).toEqual([roots[0]])
      expect(service.list()).toHaveLength(3)
    }
  )
})
