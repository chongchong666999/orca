import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store'
import type { CocosEditorRecord } from '../../../shared/cocos-agent/cocos-editor-types'

const mocks = vi.hoisted(() => ({
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: beforeEach supplies every field read by the mocked Cocos store; no real store consumes this fixture.
  state: {} as AppState,
  directory: '',
  subscribe: vi.fn<(listener: (state: AppState, previous: AppState) => void) => void>(),
  openEditor: vi.fn(),
  refreshEditorBindings: vi.fn(async () => {}),
  activateEditor: vi.fn(async () => {}),
  onEditorEvicted: vi.fn<(listener: (record: CocosEditorRecord) => void) => void>(),
  destroy: vi.fn(),
  setUrl: vi.fn(),
  closeTab: vi.fn(),
  createTab: vi.fn(),
  error: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => mocks.state, subscribe: mocks.subscribe }
}))
vi.mock('@/store/slices/browser-webview-cleanup', () => ({
  destroyWorkspaceWebviews: mocks.destroy
}))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))
vi.mock('../../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => mocks.directory })
}))
vi.mock('./cocos-workspace-project', () => ({
  cocosAgentApi: () => ({
    openEditor: mocks.openEditor,
    activateEditor: mocks.activateEditor,
    refreshEditorBindings: mocks.refreshEditorBindings,
    onEditorEvicted: mocks.onEditorEvicted
  }),
  localCocosWorkspacePath: (_state: AppState, id: string) => `/projects/${id}`,
  detectCocosProject: async () => ({ kind: 'cocos', creatorVersion: '2.4.13' }),
  isSupportedCreatorVersion: () => true
}))

const record: CocosEditorRecord = {
  projectRoot: '/projects/a',
  url: 'http://127.0.0.1:41000/?token=old',
  startedByApp: true
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: vi.mock replaces the store; this fixture supplies all fields accessed by the tested lifecycle and no production store uses it.
  mocks.state = {
    activeWorktreeId: 'b',
    activeBrowserTabId: 'other',
    activeTabType: 'browser',
    unifiedTabsByWorktree: {},
    browserTabsByWorktree: { a: [{ id: 'editor' }], b: [] },
    browserPagesByWorkspace: {
      editor: [
        {
          id: 'page',
          url: 'http://127.0.0.1:41000/?token=old&cocos-agent=editor&cocos-view=stable-page&doc=assets%2FAvatar.prefab'
        }
      ]
    },
    setBrowserPageUrl: mocks.setUrl,
    setActiveBrowserTab: (id: string) => {
      mocks.state = { ...mocks.state, activeBrowserTabId: id, activeTabType: 'browser' }
    },
    closeBrowserTab: mocks.closeTab,
    createBrowserTab: mocks.createTab
  } as unknown as AppState
  mocks.createTab.mockReturnValue({ id: 'replacement-tab' })
  mocks.refreshEditorBindings.mockResolvedValue(undefined)
  mocks.setUrl.mockImplementation((id: string, url: string) => {
    mocks.state = {
      ...mocks.state,
      browserPagesByWorkspace: {
        editor: mocks.state.browserPagesByWorkspace.editor.map((page) =>
          page.id === id ? { ...page, url } : page
        )
      }
    }
  })
  mocks.openEditor.mockResolvedValue({
    ok: true,
    url: 'http://127.0.0.1:42000/?token=new',
    projectRoot: '/projects/a',
    reused: false
  })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  if (mocks.directory) {
    await rm(mocks.directory, { recursive: true, force: true })
    mocks.directory = ''
  }
})

describe('Cocos editor budget lifecycle', () => {
  it('releases evicted guests while preserving tabs and reopens only after selecting the suspended workspace', async () => {
    const { installRestoredEditorTabRefresh } = await import('./cocos-editor-tab-refresh')
    const { isCocosEditorSuspended } = await import('./cocos-editor-suspension')
    installRestoredEditorTabRefresh()
    const evict = mocks.onEditorEvicted.mock.calls[0][0]
    evict(record)
    expect(mocks.destroy).toHaveBeenCalledWith(mocks.state.browserPagesByWorkspace, 'editor')
    expect(isCocosEditorSuspended('editor')).toBe(true)
    expect(mocks.closeTab).not.toHaveBeenCalled()
    expect(mocks.openEditor).not.toHaveBeenCalled()
    const changed = mocks.subscribe.mock.calls[0][0]
    const before = mocks.state
    mocks.state = { ...before, browserTabsByWorktree: { ...before.browserTabsByWorktree } }
    changed(mocks.state, before)
    expect(mocks.openEditor).not.toHaveBeenCalled()
    const background = mocks.state
    mocks.state = { ...background, activeWorktreeId: 'a', activeBrowserTabId: 'editor' }
    changed(mocks.state, background)
    await vi.waitFor(() => expect(isCocosEditorSuspended('editor')).toBe(false))
    expect(mocks.openEditor).toHaveBeenCalledWith({
      projectPath: '/projects/a',
      document: 'assets/Avatar.prefab'
    })
    expect(mocks.setUrl).toHaveBeenCalledWith(
      'page',
      'http://127.0.0.1:42000/?token=new&cocos-agent=editor&cocos-workspace=a&cocos-view=stable-page&doc=assets%2FAvatar.prefab'
    )
    expect(mocks.refreshEditorBindings).toHaveBeenCalledWith({
      projectPath: '/projects/a',
      workspaceId: 'a',
      viewId: 'stable-page'
    })
    expect(mocks.createTab).not.toHaveBeenCalled()
    expect(mocks.closeTab).not.toHaveBeenCalled()
  })

  it('reopens the editor on screen as soon as its service is reported gone', async () => {
    mocks.state = { ...mocks.state, activeWorktreeId: 'a', activeBrowserTabId: 'editor' }
    const { installRestoredEditorTabRefresh } = await import('./cocos-editor-tab-refresh')
    const { isCocosEditorSuspended } = await import('./cocos-editor-suspension')
    installRestoredEditorTabRefresh()
    await vi.waitFor(() =>
      expect(mocks.state.browserPagesByWorkspace.editor[0].url).toContain('token=new&')
    )
    mocks.openEditor.mockResolvedValue({
      ok: true,
      url: 'http://127.0.0.1:43000/?token=newer',
      projectRoot: '/projects/a',
      reused: false
    })
    mocks.onEditorEvicted.mock.calls[0][0]({
      ...record,
      url: 'http://127.0.0.1:42000/?token=new'
    })
    await vi.waitFor(() =>
      expect(mocks.state.browserPagesByWorkspace.editor[0].url).toBe(
        'http://127.0.0.1:43000/?token=newer&cocos-agent=editor&cocos-workspace=a&cocos-view=stable-page&doc=assets%2FAvatar.prefab'
      )
    )
    expect(isCocosEditorSuspended('editor')).toBe(false)
    expect(mocks.openEditor).toHaveBeenCalledTimes(2)
    expect(mocks.createTab).not.toHaveBeenCalled()
  })

  it('keeps a failed resume suspended without retrying on background store notifications', async () => {
    mocks.openEditor.mockResolvedValue({
      ok: false,
      code: 'capacity',
      message: 'capacity protected'
    })
    const { installRestoredEditorTabRefresh } = await import('./cocos-editor-tab-refresh')
    const { isCocosEditorSuspended } = await import('./cocos-editor-suspension')
    installRestoredEditorTabRefresh()
    mocks.onEditorEvicted.mock.calls[0][0](record)
    const changed = mocks.subscribe.mock.calls[0][0]
    const before = mocks.state
    mocks.state = { ...before, activeWorktreeId: 'a', activeBrowserTabId: 'editor' }
    changed(mocks.state, before)
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledWith('capacity protected'))
    const selected = mocks.state
    mocks.state = { ...selected, browserTabsByWorktree: { ...selected.browserTabsByWorktree } }
    changed(mocks.state, selected)
    expect(mocks.openEditor).toHaveBeenCalledTimes(1)
    expect(isCocosEditorSuspended('editor')).toBe(true)
    expect(mocks.setUrl).not.toHaveBeenCalled()
  })

  it('does not recreate a tab the user closed during resume', async () => {
    let finish!: (value: unknown) => void
    mocks.openEditor.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const { suspendCocosEditor, openCocosEditorTab } = await import('./cocos-editor-tabs')
    suspendCocosEditor(record)
    const opening = openCocosEditorTab('a', '/projects/a')
    mocks.state = { ...mocks.state, browserTabsByWorktree: {}, browserPagesByWorkspace: {} }
    finish({
      ok: true,
      url: 'http://127.0.0.1:42000/?token=new',
      projectRoot: '/projects/a',
      reused: false
    })
    await expect(opening).resolves.toEqual({ kind: 'abandoned' })
    expect(mocks.createTab).not.toHaveBeenCalled()
    expect(mocks.setUrl).not.toHaveBeenCalled()
  })

  it('restores the retained Prefab and page identity after an app restart and refreshes its terminal binding', async () => {
    const { openCocosEditorTab } = await import('./cocos-editor-tabs')
    await expect(
      openCocosEditorTab('a', '/projects/a', { replacing: ['editor'], focus: 'unchanged' })
    ).resolves.toEqual({ kind: 'opened' })
    expect(mocks.destroy).not.toHaveBeenCalled()
    expect(mocks.openEditor).toHaveBeenCalledWith({
      projectPath: '/projects/a',
      document: 'assets/Avatar.prefab'
    })
    expect(mocks.setUrl).toHaveBeenCalledWith(
      'page',
      'http://127.0.0.1:42000/?token=new&cocos-agent=editor&cocos-workspace=a&cocos-view=stable-page&doc=assets%2FAvatar.prefab'
    )
    expect(mocks.refreshEditorBindings).toHaveBeenCalledWith({
      projectPath: '/projects/a',
      workspaceId: 'a',
      viewId: 'stable-page'
    })
    expect(mocks.closeTab).not.toHaveBeenCalled()
  })

  it.each(['selection', 'menu', 'retry action'])(
    'repairs the retained terminal binding after an initial connection failure via %s',
    async (entry) => {
      mocks.directory = await mkdtemp(path.join(os.tmpdir(), 'cocos-ui-binding-retry-'))
      const directory = path.join(mocks.directory, 'cocos-editor-sessions', 'session-retained')
      await mkdir(directory, { recursive: true })
      const file = path.join(directory, 'binding.json')
      await writeFile(
        file,
        JSON.stringify({
          projectRoot: '/projects/a',
          workspaceId: 'a',
          viewId: 'stable-page',
          instanceId: 'old-instance',
          url: 'http://127.0.0.1:41000/',
          token: 'old'
        })
      )
      const { refreshCocosEditorBindings } =
        await import('../../../main/cocos-agent/cocos-editor-mcp-bindings')
      mocks.refreshEditorBindings.mockImplementation(async () =>
        refreshCocosEditorBindings(
          { ...record, url: 'http://127.0.0.1:42000/?token=new' },
          'a',
          'stable-page',
          () => true
        )
      )
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('connection unavailable')
        })
      )
      mocks.state = { ...mocks.state, activeWorktreeId: 'a', activeTabType: 'terminal' }
      const { installRestoredEditorTabRefresh } = await import('./cocos-editor-tab-refresh')
      const { focusOrOpenCocosEditor } = await import('./cocos-editor-tabs')
      installRestoredEditorTabRefresh()
      await vi.waitFor(() => expect(mocks.error).toHaveBeenCalled())
      expect(JSON.parse(await readFile(file, 'utf8')).instanceId).toBe('old-instance')
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({
            projectRoot: '/projects/a',
            viewId: 'stable-page',
            instanceId: 'new-instance',
            capabilities: ['editor-context-v1']
          })
        )
      )
      if (entry === 'selection') {
        const before = mocks.state
        mocks.state = { ...before, activeTabType: 'browser', activeBrowserTabId: 'editor' }
        mocks.subscribe.mock.calls[0][0](mocks.state, before)
      } else if (entry === 'menu') {
        await focusOrOpenCocosEditor('a', '/projects/a')
      } else {
        const action = mocks.error.mock.calls.at(-1)?.[1]?.action
        expect(action).toBeDefined()
        action.onClick()
      }
      await vi.waitFor(async () =>
        expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
          instanceId: 'new-instance',
          workspaceId: 'a',
          viewId: 'stable-page',
          url: 'http://127.0.0.1:42000/'
        })
      )
    }
  )

  it('retries a failed restored editor on explicit selection after capacity becomes available', async () => {
    mocks.state = { ...mocks.state, activeWorktreeId: 'a', activeBrowserTabId: 'editor' }
    mocks.openEditor.mockResolvedValueOnce({
      ok: false,
      code: 'capacity',
      message: 'capacity protected'
    })
    const { installRestoredEditorTabRefresh } = await import('./cocos-editor-tab-refresh')
    installRestoredEditorTabRefresh()
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalled())
    const changed = mocks.subscribe.mock.calls[0][0]
    const before = mocks.state
    mocks.state = { ...before, activeWorktreeId: 'b', activeBrowserTabId: 'other' }
    changed(mocks.state, before)
    const away = mocks.state
    mocks.state = { ...away, activeWorktreeId: 'a', activeBrowserTabId: 'editor' }
    changed(mocks.state, away)
    await vi.waitFor(() =>
      expect(mocks.state.browserPagesByWorkspace.editor[0].url).toBe(
        'http://127.0.0.1:42000/?token=new&cocos-agent=editor&cocos-workspace=a&cocos-view=stable-page&doc=assets%2FAvatar.prefab'
      )
    )
  })

  it('keeps the document closed if the retained page clears doc while editor open is pending', async () => {
    let finish!: (value: unknown) => void
    mocks.openEditor.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const { openCocosEditorTab } = await import('./cocos-editor-tabs')
    const opening = openCocosEditorTab('a', '/projects/a', {
      replacing: ['editor'],
      focus: 'unchanged'
    })
    mocks.setUrl(
      'page',
      'http://127.0.0.1:41000/?token=old&cocos-agent=editor&cocos-view=stable-page'
    )
    finish({
      ok: true,
      projectRoot: '/projects/a',
      reused: true,
      url: 'http://127.0.0.1:41000/?token=old&doc=assets%2FAvatar.prefab'
    })
    await opening
    expect(new URL(mocks.state.browserPagesByWorkspace.editor[0].url).searchParams.has('doc')).toBe(
      false
    )
  })
})
