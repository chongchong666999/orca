import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore, type AppState } from '@/store'
import {
  cocosAgentApi,
  detectCocosProject,
  isSupportedCreatorVersion,
  localCocosWorkspacePath
} from './cocos-workspace-project'
import { findCocosEditorTabId, findEditorPageTabs, openCocosEditorTab } from './cocos-editor-tabs'

/** Workspaces whose restored editor tabs were already handed to a live editor this session. */
const refreshedWorkspaces = new Set<string>()
let installed = false

function refreshRestoredEditorTabs(state: AppState): void {
  const worktreeId = state.activeWorktreeId
  if (
    !worktreeId ||
    refreshedWorkspaces.has(worktreeId) ||
    findCocosEditorTabId(state, worktreeId) !== null ||
    findEditorPageTabs(state, worktreeId).length === 0
  ) {
    return
  }
  const projectPath = localCocosWorkspacePath(state, worktreeId)
  if (!projectPath) {
    return
  }
  refreshedWorkspaces.add(worktreeId)
  const replacing = findEditorPageTabs(state, worktreeId).map((tab) => tab.tabId)
  void detectCocosProject(projectPath).then(async (detection) => {
    if (detection.kind !== 'cocos' || !isSupportedCreatorVersion(detection.creatorVersion)) {
      return
    }
    const stillRestored = findEditorPageTabs(useAppStore.getState(), worktreeId).some((tab) =>
      replacing.includes(tab.tabId)
    )
    if (!stillRestored) {
      return
    }
    const outcome = await openCocosEditorTab(worktreeId, projectPath, {
      focus: 'unchanged',
      replacing
    })
    if (outcome.kind === 'failed') {
      toast.error(
        translate('cocosEditor.errors.reopen', 'Could not reopen the Cocos Creator editor'),
        {
          description: outcome.message
        }
      )
    }
  })
}

/**
 * Editor tabs come back with the session, but their editors exited with the previous app run. When such a workspace
 * is active, start (or reuse) its editor and swap the stale tab for a live one, once per workspace per session.
 */
export function installRestoredEditorTabRefresh(): void {
  if (installed || !cocosAgentApi()) {
    return
  }
  installed = true
  refreshRestoredEditorTabs(useAppStore.getState())
  // Why: tabs hydrate after the active workspace is chosen, so either change can reveal a restored editor tab.
  useAppStore.subscribe((state, previous) => {
    if (
      state.activeWorktreeId !== previous.activeWorktreeId ||
      state.browserTabsByWorktree !== previous.browserTabsByWorktree
    ) {
      refreshRestoredEditorTabs(state)
    }
  })
}
