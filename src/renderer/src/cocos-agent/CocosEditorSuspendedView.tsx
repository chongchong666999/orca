import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { localCocosWorkspacePath } from './cocos-workspace-project'
import { openCocosEditorTab } from './cocos-editor-tabs'

export function CocosEditorSuspendedView({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element {
  const [pending, setPending] = useState(false)
  const resume = async (): Promise<void> => {
    const projectPath = localCocosWorkspacePath(useAppStore.getState(), worktreeId)
    if (!projectPath) {
      return
    }
    setPending(true)
    try {
      const outcome = await openCocosEditorTab(worktreeId, projectPath, { focus: 'unchanged' })
      if (outcome.kind === 'failed') {
        toast.error(outcome.message)
      }
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-background text-foreground">
      <p className="text-sm text-muted-foreground">
        {translate('cocosEditor.suspended', 'This editor was paused to free memory.')}
      </p>
      <Button variant="outline" disabled={pending} onClick={() => void resume()}>
        {pending
          ? translate('cocosEditor.resuming', 'Resuming editor…')
          : translate('cocosEditor.resume', 'Resume Cocos Creator')}
      </Button>
    </div>
  )
}
