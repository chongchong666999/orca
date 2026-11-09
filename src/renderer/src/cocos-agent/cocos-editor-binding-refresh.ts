import { toast } from 'sonner'
import { cocosText } from './cocos-text'
import { useAppStore } from '@/store'
import { cocosAgentApi, localCocosWorkspacePath } from './cocos-workspace-project'
import { editorIdentity } from './cocos-editor-page-identity'
import { isCocosEditorSuspended, wasCocosEditorEvicted } from './cocos-editor-suspension'

const refreshingBindings = new Map<string, Promise<void>>()

export async function refreshCocosEditorTabBindings(
  worktreeId: string,
  projectPath: string,
  tabId: string
): Promise<void> {
  const api = cocosAgentApi()
  if (!api) {
    return
  }
  const state = useAppStore.getState()
  await Promise.all(
    (state.browserPagesByWorkspace[tabId] ?? []).map(async (page) => {
      const identity = editorIdentity(page.url, true)
      const viewId = identity ? new URL(page.url).searchParams.get('cocos-view') : null
      if (!identity || !viewId) {
        return
      }
      const isCurrent = (): boolean => {
        const current = useAppStore.getState()
        return (
          !isCocosEditorSuspended(tabId) &&
          !wasCocosEditorEvicted(identity) &&
          localCocosWorkspacePath(current, worktreeId) === projectPath &&
          (current.browserTabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === tabId) &&
          (current.browserPagesByWorkspace[tabId] ?? []).some(
            (candidate) =>
              candidate.id === page.id &&
              editorIdentity(candidate.url, true) === identity &&
              new URL(candidate.url).searchParams.get('cocos-view') === viewId
          )
        )
      }
      if (!isCurrent()) {
        return
      }
      const key = `${worktreeId}\0${tabId}\0${identity}\0${viewId}`
      const pending = refreshingBindings.get(key)
      if (pending) {
        return pending
      }
      const refresh = api
        .refreshEditorBindings({ projectPath, workspaceId: worktreeId, viewId })
        .catch((error: unknown) => {
          if (isCurrent()) {
            toast.error(
              cocosText('editor.errors.aiResume', 'Could not reconnect the AI terminal'),
              {
                description: error instanceof Error ? error.message : String(error),
                action: {
                  label: cocosText('editor.retryAiConnection', 'Retry connection'),
                  onClick: () => {
                    if (isCurrent()) {
                      void refreshCocosEditorTabBindings(worktreeId, projectPath, tabId)
                    }
                  }
                }
              }
            )
          }
        })
        .finally(() => refreshingBindings.delete(key))
      refreshingBindings.set(key, refresh)
      return refresh
    })
  )
}
