import { refreshCocosEditorTabBindings } from './cocos-editor-binding-refresh'
import { toast } from 'sonner'
import { cocosText } from './cocos-text'
import { useAppStore, type AppState } from '@/store'
import {
  cocosAgentApi,
  detectCocosProject,
  isSupportedCreatorVersion,
  localCocosWorkspacePath
} from './cocos-workspace-project'
import { isCocosEditorSuspended } from './cocos-editor-suspension'
import {
  findCocosEditorTabId,
  findEditorPageTabs,
  openCocosEditorTab,
  suspendCocosEditor
} from './cocos-editor-tabs'

const restorationAttempts = new Map<string, 'pending' | 'opened' | 'failed'>()
let installed = false

function refreshRestoredEditorTabs(state: AppState): void {
  const worktreeId = state.activeWorktreeId
  if (
    !worktreeId ||
    restorationAttempts.has(worktreeId) ||
    findCocosEditorTabId(state, worktreeId) !== null ||
    findEditorPageTabs(state, worktreeId).length === 0 ||
    findEditorPageTabs(state, worktreeId).some((tab) => isCocosEditorSuspended(tab.tabId))
  ) {
    return
  }
  const projectPath = localCocosWorkspacePath(state, worktreeId)
  if (!projectPath) {
    return
  }
  restorationAttempts.set(worktreeId, 'pending')
  const replacing = findEditorPageTabs(state, worktreeId).map((tab) => tab.tabId)
  void detectCocosProject(projectPath).then(async (detection) => {
    if (detection.kind !== 'cocos' || !isSupportedCreatorVersion(detection.creatorVersion)) {
      restorationAttempts.set(worktreeId, 'failed')
      return
    }
    if (useAppStore.getState().activeWorktreeId !== worktreeId) {
      restorationAttempts.delete(worktreeId)
      return
    }
    const stillRestored = findEditorPageTabs(useAppStore.getState(), worktreeId).some(
      (tab) => replacing.includes(tab.tabId) && !isCocosEditorSuspended(tab.tabId)
    )
    if (!stillRestored) {
      restorationAttempts.set(worktreeId, 'opened')
      return
    }
    const outcome = await openCocosEditorTab(worktreeId, projectPath, {
      focus: 'unchanged',
      replacing
    })
    restorationAttempts.set(worktreeId, outcome.kind === 'failed' ? 'failed' : 'opened')
    if (outcome.kind === 'failed') {
      toast.error(cocosText('editor.errors.reopen', 'Could not reopen the Cocos Creator editor'), {
        description: outcome.message
      })
    }
  })
}

/** Failed restorations retry on explicit selection, never on background store notifications. */
export function installRestoredEditorTabRefresh(): void {
  if (installed || !cocosAgentApi()) {
    return
  }
  installed = true
  cocosAgentApi()?.onEditorEvicted(suspendCocosEditor)
  refreshRestoredEditorTabs(useAppStore.getState())
  // Why: tabs hydrate after the active workspace is chosen, so either change can reveal a restored editor tab.
  useAppStore.subscribe((state, previous) => {
    const selectionChanged =
      state.activeWorktreeId !== previous.activeWorktreeId ||
      state.activeBrowserTabId !== previous.activeBrowserTabId ||
      state.activeTabType !== previous.activeTabType
    if (selectionChanged) {
      const projectPath = state.activeWorktreeId
        ? localCocosWorkspacePath(state, state.activeWorktreeId)
        : null
      void cocosAgentApi()
        ?.activateEditor(projectPath)
        .catch(() => undefined)
    }
    if (selectionChanged && state.activeWorktreeId) {
      const projectPath = localCocosWorkspacePath(state, state.activeWorktreeId)
      if (projectPath) {
        const tabId = state.activeBrowserTabId
        if (state.activeTabType === 'browser' && tabId && isCocosEditorSuspended(tabId)) {
          void openCocosEditorTab(state.activeWorktreeId, projectPath, { focus: 'unchanged' }).then(
            (outcome) => {
              if (outcome.kind === 'failed') {
                toast.error(outcome.message)
              }
            }
          )
        } else if (
          state.activeTabType === 'browser' &&
          tabId &&
          findEditorPageTabs(state, state.activeWorktreeId).some((tab) => tab.tabId === tabId)
        ) {
          if (restorationAttempts.get(state.activeWorktreeId) === 'failed') {
            restorationAttempts.delete(state.activeWorktreeId)
          }
          if (findCocosEditorTabId(state, state.activeWorktreeId) === tabId) {
            void refreshCocosEditorTabBindings(state.activeWorktreeId, projectPath, tabId)
          }
        }
      }
    }
    // Project ownership and page URLs can hydrate after the selected tab.
    refreshRestoredEditorTabs(state)
  })
}
