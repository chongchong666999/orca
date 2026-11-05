import { toast } from 'sonner'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { useAppStore, type AppState } from '@/store'
import { cocosAgentApi, localCocosWorkspacePath } from './cocos-workspace-project'

const EDITOR_TAB_TITLE = 'Cocos Creator'
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

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

// Why: only tabs cocos-agent opened carry this; the editor page keeps unknown query params as it switches documents.
const EDITOR_TAB_MARKER = ['cocos-agent', 'editor'] as const

function markedEditorUrl(url: string): string {
  const parsed = new URL(url)
  parsed.searchParams.set(...EDITOR_TAB_MARKER)
  return parsed.toString()
}

/** The editor a GitNexus editor page URL belongs to (its origin and session token); null for any other page. */
function editorIdentity(url: string, requireMarker: boolean): string | null {
  try {
    const parsed = new URL(url)
    const token = parsed.searchParams.get('token')
    const isEditorPage =
      parsed.protocol === 'http:' &&
      LOOPBACK_HOSTS.has(parsed.hostname) &&
      parsed.pathname === '/' &&
      Boolean(token) &&
      (!requireMarker || parsed.searchParams.get(EDITOR_TAB_MARKER[0]) === EDITOR_TAB_MARKER[1])
    return isEditorPage ? `${parsed.origin}\0${token}` : null
  } catch {
    return null
  }
}

/** Browser tabs in the workspace showing an editor page cocos-agent opened, including ones restored from an earlier app session. */
export function findEditorPageTabs(
  state: AppState,
  worktreeId: string
): { tabId: string; identity: string }[] {
  return (state.browserTabsByWorktree[worktreeId] ?? []).flatMap((tab) => {
    const identity = (state.browserPagesByWorkspace[tab.id] ?? [])
      .map((page) => editorIdentity(page.url, true))
      .find((value) => value !== null)
    return identity ? [{ tabId: tab.id, identity }] : []
  })
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
    return { kind: 'failed', message: 'cocos-agent is not available in this window.' }
  }
  const result = await api.openEditor({ projectPath }).catch((error: unknown) => ({
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
  const tab = state.createBrowserTab(worktreeId, markedEditorUrl(result.url), {
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
  if (existingTabId) {
    state.setActiveBrowserTab(existingTabId, worktreeId)
    return
  }
  let outcome = await openCocosEditorTab(worktreeId, projectPath)
  if (outcome.kind === 'abandoned' && !findCocosEditorTabId(useAppStore.getState(), worktreeId)) {
    // Why: the click can join an automatic refresh that gave up because its restored tabs were closed.
    outcome = await openCocosEditorTab(worktreeId, projectPath)
  }
  if (outcome.kind === 'failed') {
    toast.error('Could not open the Cocos Creator editor', { description: outcome.message })
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
    toast.error('Could not stop the Cocos Creator editor', {
      description: 'It did not confirm the shutdown or is still shutting down; try again shortly.'
    })
    return
  }
  const tabId = findCocosEditorTabId(useAppStore.getState(), worktreeId)
  editorTabIdByWorkspace.delete(worktreeId)
  if (tabId) {
    useAppStore.getState().closeBrowserTab(tabId)
  }
}
