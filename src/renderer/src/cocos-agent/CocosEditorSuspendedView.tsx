import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cocosText } from './cocos-text'
import { useAppStore } from '@/store'
import { localCocosWorkspacePath } from './cocos-workspace-project'
import { openCocosEditorTab } from './cocos-editor-tabs'

/** `stopped`: a tab restored from an earlier session whose editor this session could not open. */
export function CocosEditorSuspendedView({
  worktreeId,
  stopped = false
}: {
  worktreeId: string
  stopped?: boolean
}): React.JSX.Element {
  const [pending, setPending] = useState(false)
  const resume = async (): Promise<void> => {
    const projectPath = localCocosWorkspacePath(useAppStore.getState(), worktreeId)
    if (!projectPath) {
      return
    }
    setPending(true)
    const outcome = await openCocosEditorTab(worktreeId, projectPath, {
      focus: 'unchanged'
    }).finally(() => setPending(false))
    if (outcome.kind === 'failed') {
      toast.error(outcome.message)
    }
  }
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-background text-foreground">
      <p className="text-sm text-muted-foreground">
        {stopped
          ? cocosText('editor.notRunning', 'The Cocos Creator editor is not running.')
          : cocosText('editor.suspended', 'This editor was paused to free memory.')}
      </p>
      <Button variant="outline" disabled={pending} onClick={() => void resume()}>
        {pending
          ? cocosText('editor.resuming', 'Resuming editor…')
          : cocosText('editor.resume', 'Resume Cocos Creator')}
      </Button>
    </div>
  )
}
