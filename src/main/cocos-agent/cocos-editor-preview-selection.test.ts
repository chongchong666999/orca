import { beforeEach, expect, it, vi } from 'vitest'
import type { ProcessResult } from '@orca/process-host/process-spec'
import type { CocosEditorRecord } from '../../shared/cocos-agent/cocos-editor-types'
import { CocosEditorService } from './cocos-editor-service'

const lookup = vi.hoisted(() => vi.fn())
vi.mock('./cocos-project-detection', () => ({
  resolveCocosProjectRoot: async (path: string) => path,
  findCocosEditorForWorkspace: lookup
}))
vi.mock('./cocos-editor-sdk', () => ({ prepareBundledCocosSdk: async () => {} }))
beforeEach(() => lookup.mockReset())

const a: CocosEditorRecord = {
  projectRoot: '/A',
  url: 'http://127.0.0.1:40001/?token=A',
  startedByApp: true
}
const b: CocosEditorRecord = {
  projectRoot: '/B',
  url: 'http://127.0.0.1:40002/?token=B',
  startedByApp: true
}
function setup() {
  const preview = {
    start: vi.fn(async () => true),
    select: vi.fn(),
    remove: vi.fn(),
    close: vi.fn(async () => {}),
    warning: undefined
  }
  const runProcess = vi.fn(async (): Promise<ProcessResult> => ({
    code: 0,
    signal: null,
    timedOut: false,
    stdout: JSON.stringify({ event: 'open', url: a.url, project: a.projectRoot, running: false }),
    stderr: ''
  }))
  const service = new CocosEditorService({
    preview,
    resolveBinary: async () => '/binary',
    runProcess,
    fetch: vi.fn(async () => new Response('{"stopping":true}'))
  })
  return { preview, service, runProcess }
}

it('reserves the shared preview entry before starting a native editor', async () => {
  const { preview, service, runProcess } = setup()
  await service.open('/A')
  expect(preview.start).toHaveBeenCalledTimes(1)
  expect(preview.start.mock.invocationCallOrder[0]).toBeLessThan(
    runProcess.mock.invocationCallOrder[0]
  )
})

it('does not let a slow A activation replace the more recently selected B project', async () => {
  const { preview, service } = setup()
  await service.open('/A')
  await service.open('/B')
  let release: (record: CocosEditorRecord) => void = () => {
    throw new Error('No pending lookup')
  }
  lookup.mockImplementationOnce(
    () =>
      new Promise<CocosEditorRecord>((resolve) => {
        release = resolve
      })
  )
  const first = service.activate('/A')
  lookup.mockResolvedValueOnce(b)
  await service.activate('/B')
  release(a)
  await first
  expect(preview.select).toHaveBeenLastCalledWith(b)
  expect(preview.select).not.toHaveBeenCalledWith(a)
  await service.activate(null)
  expect(preview.select).toHaveBeenLastCalledWith(null)
})

it('releases the application-owned preview listener on quit', async () => {
  const { service, preview } = setup()
  service.shutdownForQuit()
  expect(preview.close).toHaveBeenCalledTimes(1)
})
