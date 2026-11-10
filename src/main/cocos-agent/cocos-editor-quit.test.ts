import { EventEmitter } from 'node:events'
import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  list: vi.fn(),
  stop: vi.fn(),
  shutdownForQuit: vi.fn(),
  quit: vi.fn()
}))
const app = new EventEmitter()
Object.assign(app, { quit: state.quit })
vi.mock('electron', () => ({ app }))
vi.mock('./cocos-editor-service-instance', () => ({ cocosEditorService: state }))

beforeEach(() => {
  app.removeAllListeners()
  vi.resetModules()
  vi.clearAllMocks()
})

it('vetoes quit before teardown and stays open when an editor close is cancelled', async () => {
  const { stopAppStartedEditorsOnQuit } = await import('./cocos-editor-quit')
  state.list.mockReturnValue([{ projectRoot: '/project', startedByApp: true }])
  state.stop.mockResolvedValue(false)
  stopAppStartedEditorsOnQuit()
  const event = {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true
    }
  }
  let teardown = false
  app.on('before-quit', () => {
    if (!event.defaultPrevented) {
      teardown = true
    }
  })
  app.emit('before-quit', event)
  await vi.waitFor(() => expect(state.stop).toHaveBeenCalledWith('/project', true))
  expect(event.defaultPrevented).toBe(true)
  expect(teardown).toBe(false)
  expect(state.quit).not.toHaveBeenCalled()
  expect(state.shutdownForQuit).not.toHaveBeenCalled()
})

it('finishes owned editor closes before retrying quit and leaves external services alone', async () => {
  const { stopAppStartedEditorsOnQuit } = await import('./cocos-editor-quit')
  state.list.mockReturnValue([
    { projectRoot: '/project', startedByApp: true },
    { projectRoot: '/external', startedByApp: false }
  ])
  state.stop.mockResolvedValue(true)
  stopAppStartedEditorsOnQuit()
  app.emit('before-quit', { defaultPrevented: false, preventDefault() {} })
  await vi.waitFor(() => expect(state.quit).toHaveBeenCalledOnce())
  expect(state.stop.mock.calls).toEqual([['/project', true]])
})

it('rechecks editors started during the first quit attempt', async () => {
  const { stopAppStartedEditorsOnQuit } = await import('./cocos-editor-quit')
  let remaining = [{ projectRoot: '/first', startedByApp: true }]
  state.list.mockImplementation(() => remaining)
  state.stop.mockImplementation(async (project: string) => {
    remaining = project === '/first' ? [{ projectRoot: '/new', startedByApp: true }] : []
    return true
  })
  state.quit.mockImplementation(() => {
    app.emit('before-quit', { defaultPrevented: false, preventDefault() {} })
  })
  stopAppStartedEditorsOnQuit()
  app.emit('before-quit', { defaultPrevented: false, preventDefault() {} })
  await vi.waitFor(() =>
    expect(state.stop.mock.calls).toEqual([
      ['/first', true],
      ['/new', true]
    ])
  )
})
