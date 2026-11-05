import { toast } from 'sonner'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { useAppStore, type AppState } from '@/store'
import { cocosAgentApi, localCocosWorkspacePath } from './cocos-workspace-project'

const EDITOR_TAB_TITLE = 'Cocos Creator'

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

type OpenCocosEditorTabOptions = {
  executionHostId?: ExecutionHostId
  keepUserSurfaceFocused?: boolean
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
  // Why: a surface the user opened while the editor started keeps focus; the editor joins beside it.
  const userOpenedSurface =
    options.keepUserSurfaceFocused === true &&
    (state.unifiedTabsByWorktree[worktreeId] ?? []).length > 0
  const tab = state.createBrowserTab(worktreeId, result.url, {
    title: EDITOR_TAB_TITLE,
    activate: !userOpenedSurface
  })
  editorTabIdByWorkspace.set(worktreeId, tab.id)
  return { kind: 'opened' }
}

/** The + menu's Cocos Creator entry: back to this session's editor tab, else a new one. */
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
  const outcome = await openCocosEditorTab(worktreeId, projectPath)
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
