import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { Gamepad2, Loader2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { cocosText } from './cocos-text'
import {
  cocosAgentApi,
  detectCocosProject,
  getCachedCocosDetection,
  isSupportedCreatorVersion,
  localCocosWorkspacePath,
  subscribeCocosDetection
} from './cocos-workspace-project'
import { focusOrOpenCocosEditor, isCocosEditorPageUrl } from './cocos-editor-tabs'

/** The left sidebar's first entry: the active workspace's Cocos Creator, opened or brought back to its tab. */
export function CocosCreatorSidebarEntry(): React.ReactNode {
  // Why: the web client and tests have no preload API (or full store), so the workspace reads below never run there.
  return cocosAgentApi() ? <CocosCreatorSidebarButton /> : null
}

function CocosCreatorSidebarButton(): React.JSX.Element {
  const worktreeId = useAppStore((s) => s.activeWorktreeId)
  const projectPath = useAppStore((s) =>
    s.activeWorktreeId ? localCocosWorkspacePath(s, s.activeWorktreeId) : null
  )
  const detection = useSyncExternalStore(subscribeCocosDetection, () =>
    projectPath ? getCachedCocosDetection(projectPath) : undefined
  )
  const showingEditor = useAppStore(
    (s) =>
      s.activeView === 'terminal' &&
      s.activeTabType === 'browser' &&
      s.activeBrowserTabId !== null &&
      (s.browserPagesByWorkspace[s.activeBrowserTabId] ?? []).some((page) =>
        isCocosEditorPageUrl(page.url)
      )
  )
  const [opening, setOpening] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  useEffect(() => {
    if (projectPath) {
      void detectCocosProject(projectPath)
    }
  }, [projectPath])

  const available =
    detection?.kind === 'cocos' && isSupportedCreatorVersion(detection.creatorVersion)
  const unavailableReason = available
    ? null
    : detection?.kind === 'cocos'
      ? cocosText(
          'editor.errors.unsupportedVersion',
          'cocos-agent opens its editor for Cocos Creator 2.4 projects; this project uses {{version}}.',
          { version: detection.creatorVersion }
        )
      : cocosText(
          'sidebar.creator.unavailable',
          'Select a Cocos Creator 2.4 project workspace to open its editor.'
        )
  const open = (): void => {
    if (!available || opening || !worktreeId || !projectPath) {
      return
    }
    const state = useAppStore.getState()
    if (state.activeView !== 'terminal') {
      state.setActiveView('terminal')
    }
    setOpening(true)
    // Why: an editor that has to start takes seconds; a reuse answers well under the delay and shows nothing.
    const progress = setTimeout(() => setShowProgress(true), 200)
    void focusOrOpenCocosEditor(worktreeId, projectPath).finally(() => {
      clearTimeout(progress)
      setOpening(false)
      setShowProgress(false)
    })
  }

  const Icon = showProgress ? Loader2 : Gamepad2
  const button = (
    <button
      type="button"
      onClick={open}
      aria-disabled={!available || opening}
      aria-busy={opening}
      aria-current={showingEditor ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        showingEditor
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8',
        !available && 'cursor-default opacity-50 hover:bg-transparent'
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0',
          !showingEditor && 'text-worktree-sidebar-foreground/30',
          showProgress && 'animate-spin'
        )}
        strokeWidth={showingEditor ? 2.25 : 1.75}
      />
      <span className="flex-1">{cocosText('editor.menu.open', 'Cocos Creator')}</span>
    </button>
  )
  return unavailableReason ? (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={4}>
        {unavailableReason}
      </TooltipContent>
    </Tooltip>
  ) : (
    button
  )
}
