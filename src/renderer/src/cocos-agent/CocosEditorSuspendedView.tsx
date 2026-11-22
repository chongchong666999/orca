import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CocosEditorStartingView } from './CocosEditorStartingView'
import { cocosText } from './cocos-text'
import { useAppStore } from '@/store'
import { localCocosWorkspacePath } from './cocos-workspace-project'
import { openCocosEditorTab } from './cocos-editor-tabs'
import { isCocosEditorSuspended, useCocosEditorHandedBack } from './cocos-editor-tab-state'
import { withBusyFlag } from './with-busy-flag'

async function resumeSuspendedEditor(worktreeId: string, tabId: string): Promise<string | null> {
  const projectPath = localCocosWorkspacePath(useAppStore.getState(), worktreeId)
  if (!projectPath) {
    return cocosText(
      'editor.errors.localWorkspace',
      'Could not resolve the local project for this editor.'
    )
  }
  try {
    const options = { focus: 'unchanged', replacing: [tabId] } as const
    let outcome = await openCocosEditorTab(worktreeId, projectPath, options)
    if (
      outcome.kind === 'abandoned' &&
      isCocosEditorSuspended(tabId) &&
      localCocosWorkspacePath(useAppStore.getState(), worktreeId) === projectPath &&
      useAppStore.getState().browserTabsByWorktree[worktreeId]?.some((tab) => tab.id === tabId)
    ) {
      outcome = await openCocosEditorTab(worktreeId, projectPath, options)
    }
    if (outcome.kind !== 'opened') {
      return outcome.kind === 'failed'
        ? outcome.message
        : cocosText('editor.errors.reopen', 'Could not reopen the Cocos Creator editor')
    }
    return null
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause)
  }
}

/** `stopped`: a tab restored from an earlier session whose editor this session could not open. */
export function CocosEditorSuspendedView({
  worktreeId,
  tabId,
  starting,
  stopped = false
}: {
  worktreeId: string
  tabId: string
  starting: boolean
  stopped?: boolean
}): React.JSX.Element {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handedBack = useCocosEditorHandedBack(worktreeId)
  const resume = (): void => {
    setError(null)
    void withBusyFlag(setPending, () => resumeSuspendedEditor(worktreeId, tabId)).then(setError)
  }
  if (starting) {
    return <CocosEditorStartingView />
  }
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-background text-foreground">
      {handedBack ? (
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-sm font-medium">
            {cocosText('editor.handedBack.title', 'The editor service is stopped')}
          </p>
          <p className="text-xs text-muted-foreground">
            {cocosText(
              'editor.handedBack.description',
              'The project is back with Cocos Creator. Resume whenever you need it.'
            )}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {stopped
            ? cocosText('editor.notRunning', 'The Cocos Creator editor is not running.')
            : cocosText('editor.suspended', 'This editor was paused to free memory.')}
        </p>
      )}
      <Button variant="outline" disabled={pending} onClick={() => void resume()}>
        {pending
          ? cocosText('editor.resuming', 'Resuming editor…')
          : cocosText('editor.resume', 'Resume Cocos Creator')}
      </Button>
      {error && (
        <p role="alert" className="max-w-md px-4 text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
