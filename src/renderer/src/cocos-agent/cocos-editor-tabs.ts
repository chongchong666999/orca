import type { CocosEditorRecord } from '../../../shared/cocos-agent/cocos-editor-types'
import { destroyWorkspaceWebviews } from '@/store/slices/browser-webview-cleanup'
import {
  isCocosEditorSuspended,
  setCocosEditorSuspended,
  markCocosEditorEvicted,
  wasCocosEditorEvicted
} from './cocos-editor-suspension'
import { refreshCocosEditorTabBindings } from './cocos-editor-binding-refresh'
import { toast } from 'sonner'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { cocosText } from './cocos-text'
import { useAppStore, type AppState } from '@/store'
import { cocosAgentApi, localCocosWorkspacePath } from './cocos-workspace-project'
import {
  editorIdentity,
  findEditorPageTabs,
  isCocosEditorPageUrl,
  markedEditorUrl
} from './cocos-editor-page-identity'
export { findEditorPageTabs, isCocosEditorPageUrl } from './cocos-editor-page-identity'

const EDITOR_TAB_TITLE = cocosText('editor.tab.title', 'Cocos Creator')

/** The browser tab this app session opened for each workspace's editor. */
const editorTabIdByWorkspace = new Map<string, string>()
/** Opens in flight, so the automatic first surface and + menu clicks share one editor tab. */
const openingByWorkspace = new Map<string, Promise<CocosEditorTabOutcome>>()

/** `abandoned`: the workspace stopped resolving to the same local folder while the editor started. */
export type CocosEditorTabOutcome =
  | { kind: 'opened' }
  | { kind: 'abandoned' }
  | { kind: 'failed'; message: string }

export function findCocosEditorTabId(state: AppState, worktreeId: string): string | null {
  const tabId = editorTabIdByWorkspace.get(worktreeId)
  if (!tabId) {
    return null
  }
  return (state.browserTabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === tabId)
    ? tabId
    : null
}

/** Keep the workspace tab while releasing only this editor's browser guests. */
export function suspendCocosEditor(record: CocosEditorRecord): void {
  const identity = editorIdentity(record.url, false)
  if (!identity) {
    return
  }
  markCocosEditorEvicted(identity)
  const state = useAppStore.getState()
  for (const worktreeId of Object.keys(state.browserTabsByWorktree)) {
    for (const tab of findEditorPageTabs(state, worktreeId)) {
      if (tab.identity !== identity) {
        continue
      }
      setCocosEditorSuspended(tab.tabId, true)
      destroyWorkspaceWebviews(state.browserPagesByWorkspace, tab.tabId)
    }
  }
}

/**
 * `editor`: the editor tab takes focus. `user-surface`: unless the user opened something while it started.
 * `unchanged`: only when it replaces the tab that had focus.
 */
type EditorTabFocus = 'editor' | 'user-surface' | 'unchanged'

type OpenCocosEditorTabOptions = {
  executionHostId?: ExecutionHostId
  focus?: EditorTabFocus
  /** Restored tabs an automatic refresh replaces; once the user has closed them all, it opens nothing. */
  replacing?: readonly string[]
}

/** Starts (or reuses) the project's editor and opens it in a browser tab; concurrent calls share one request. */
export function openCocosEditorTab(
  worktreeId: string,
  projectPath: string,
  options: OpenCocosEditorTabOptions = {}
): Promise<CocosEditorTabOutcome> {
  const key = `${worktreeId}\0${projectPath}`
  const pending = openingByWorkspace.get(key)
  if (pending) {
    return pending
  }
  const opening = startEditorTab(worktreeId, projectPath, options).finally(() =>
    openingByWorkspace.delete(key)
  )
  openingByWorkspace.set(key, opening)
  return opening
}

function isFocusedBrowserTab(state: AppState, worktreeId: string, tabId: string): boolean {
  return (
    state.activeWorktreeId === worktreeId &&
    state.activeTabType === 'browser' &&
    state.activeBrowserTabId === tabId
  )
}

async function startEditorTab(
  worktreeId: string,
  projectPath: string,
  options: OpenCocosEditorTabOptions
): Promise<CocosEditorTabOutcome> {
  const api = cocosAgentApi()
  if (!api) {
    return {
      kind: 'failed',
      message: cocosText(
        'editor.errors.unavailable',
        'cocos-agent is not available in this window.'
      )
    }
  }
  const before = useAppStore.getState()
  const retainedTabs = findEditorPageTabs(before, worktreeId).filter(
    (tab) => !options.replacing || options.replacing.includes(tab.tabId)
  )
  const retainedPage = retainedTabs
    .flatMap((tab) => before.browserPagesByWorkspace[tab.tabId] ?? [])
    .find((page) => isCocosEditorPageUrl(page.url))
  const document = retainedPage
    ? (new URL(retainedPage.url).searchParams.get('doc') ?? undefined)
    : undefined
  const result = await api
    .openEditor({ projectPath, ...(document ? { document } : {}) })
    .catch((error: unknown) => ({
      ok: false as const,
      message: error instanceof Error ? error.message : String(error)
    }))
  const state = useAppStore.getState()
  if (localCocosWorkspacePath(state, worktreeId, options.executionHostId) !== projectPath) {
    return { kind: 'abandoned' }
  }
  if (!result.ok) {
    return { kind: 'failed', message: result.message }
  }
  if (result.previewWarning) {
    toast.warning(
      cocosText('editor.previewEntryUnavailable', 'Shared preview entry is unavailable'),
      { description: result.previewWarning }
    )
  }
  if (state.activeWorktreeId === worktreeId) {
    void api.activateEditor(projectPath).catch(() => undefined)
  }
  if (wasCocosEditorEvicted(editorIdentity(result.url, false) ?? '')) {
    return { kind: 'abandoned' }
  }
  if (retainedTabs.length > 0) {
    let resumed = false
    for (const tab of retainedTabs) {
      let tabResumed = false
      for (const page of state.browserPagesByWorkspace[tab.tabId] ?? []) {
        if (!isCocosEditorPageUrl(page.url)) {
          continue
        }
        const url = new URL(markedEditorUrl(result.url, worktreeId))
        const previousUrl = new URL(page.url)
        const previousView = previousUrl.searchParams.get('cocos-view')
        if (previousView) {
          url.searchParams.set('cocos-view', previousView)
        }
        const previousDocument = previousUrl.searchParams.get('doc')
        if (previousDocument) {
          url.searchParams.set('doc', previousDocument)
        } else {
          url.searchParams.delete('doc')
        }
        if (url.toString() !== page.url) {
          state.setBrowserPageUrl(page.id, url.toString())
        }
        resumed = true
        tabResumed = true
      }
      if (tabResumed) {
        editorTabIdByWorkspace.set(worktreeId, tab.tabId)
        setCocosEditorSuspended(tab.tabId, false)
        void refreshCocosEditorTabBindings(worktreeId, projectPath, tab.tabId)
      }
    }
    return { kind: resumed ? 'opened' : 'abandoned' }
  }
  if (findCocosEditorTabId(state, worktreeId)) {
    return { kind: 'opened' }
  }
  const restoredTabs = findEditorPageTabs(state, worktreeId).filter(
    (tab) => !options.replacing || options.replacing.includes(tab.tabId)
  )
  if (options.replacing && restoredTabs.length === 0) {
    return { kind: 'abandoned' }
  }
  const liveTab = restoredTabs.find((tab) => tab.identity === editorIdentity(result.url, false))
  if (liveTab) {
    editorTabIdByWorkspace.set(worktreeId, liveTab.tabId)
    return { kind: 'opened' }
  }
  const focus = options.focus ?? 'editor'
  // Why: a surface the user opened while the editor started keeps focus; the editor joins beside it.
  const userOpenedSurface = (state.unifiedTabsByWorktree[worktreeId] ?? []).length > 0
  const replacesFocusedTab = restoredTabs.some((tab) =>
    isFocusedBrowserTab(state, worktreeId, tab.tabId)
  )
  const activate =
    focus === 'editor' || replacesFocusedTab || (focus === 'user-surface' && !userOpenedSurface)
  // Why: open the fresh tab first; closing a workspace's last tab would otherwise drop it back to the welcome page.
  const tab = state.createBrowserTab(worktreeId, markedEditorUrl(result.url, worktreeId), {
    title: EDITOR_TAB_TITLE,
    activate
  })
  editorTabIdByWorkspace.set(worktreeId, tab.id)
  // Why: a restored tab's editor has exited, so its token opens nothing; it is not the user's to reopen either.
  for (const staleTab of restoredTabs) {
    useAppStore
      .getState()
      .closeBrowserTab(staleTab.tabId, { reason: 'cleanup', preserveWorktreeSelection: true })
  }
  return { kind: 'opened' }
}

/** Whether the workspace shows an editor tab, live from this session or restored from an earlier one. */
export function hasCocosEditorTab(state: AppState, worktreeId: string): boolean {
  return (
    findCocosEditorTabId(state, worktreeId) !== null ||
    findEditorPageTabs(state, worktreeId).length > 0
  )
}

/** The + menu's Cocos Creator entry: back to this session's editor tab, else a restored or new one. */
export async function focusOrOpenCocosEditor(
  worktreeId: string,
  projectPath: string
): Promise<void> {
  const state = useAppStore.getState()
  const existingTabId = findCocosEditorTabId(state, worktreeId)
  if (existingTabId && !isCocosEditorSuspended(existingTabId)) {
    state.setActiveBrowserTab(existingTabId, worktreeId)
    void cocosAgentApi()
      ?.activateEditor(projectPath)
      .catch(() => undefined)
    await refreshCocosEditorTabBindings(worktreeId, projectPath, existingTabId)
    return
  }
  let outcome = await openCocosEditorTab(worktreeId, projectPath)
  if (outcome.kind === 'abandoned' && !findCocosEditorTabId(useAppStore.getState(), worktreeId)) {
    // Why: the click can join an automatic refresh that gave up because its restored tabs were closed.
    outcome = await openCocosEditorTab(worktreeId, projectPath)
  }
  if (outcome.kind === 'failed') {
    toast.error(cocosText('editor.errors.open', 'Could not open the Cocos Creator editor'), {
      description: outcome.message
    })
    return
  }
  // Why: the click may have joined an automatic open that left the user's own surface focused.
  const openedTabId = findCocosEditorTabId(useAppStore.getState(), worktreeId)
  if (openedTabId) {
    useAppStore.getState().setActiveBrowserTab(openedTabId, worktreeId)
  }
}

/** Stops the project's editor and closes its tab, so the next open starts a fresh editor. */
export async function stopCocosEditor(worktreeId: string, projectPath: string): Promise<void> {
  const api = cocosAgentApi()
  if (!api) {
    return
  }
  const stopped = await api.stopEditor(projectPath).catch(() => false)
  if (!stopped) {
    return
  }
  const tabId = findCocosEditorTabId(useAppStore.getState(), worktreeId)
  editorTabIdByWorkspace.delete(worktreeId)
  if (tabId) {
    useAppStore.getState().closeBrowserTab(tabId)
  }
}
