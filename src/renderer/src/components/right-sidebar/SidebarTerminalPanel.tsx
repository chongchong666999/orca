import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { History, TerminalSquare, X } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { closeTerminalTab } from '../terminal/terminal-tab-actions'
import { SidebarTerminalCreateMenu } from './SidebarTerminalCreateMenu'
import { cocosText } from '@/cocos-agent/cocos-text'
import { cn } from '@/lib/utils'
import { TerminalOverlaySlot } from '../terminal-pane/TerminalOverlaySlot'
import { isSidebarTerminal } from '../../../../shared/sidebar-terminal-sessions'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'

const NO_REACTION = (): (() => void) => () => {}

function WorkspaceTerminals({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const tabs = useAppStore(
    useShallow((s) =>
      (s.tabsByWorktree[worktreeId] ?? []).filter((tab) =>
        isSidebarTerminal(s.sidebarTerminalSessionsByWorktree, worktreeId, tab.id)
      )
    )
  )
  const workspace = useAppStore((s) => s.getKnownWorktreeById(worktreeId))
  const selectedId = useAppStore(
    (s) => s.sidebarTerminalSessionsByWorktree[worktreeId]?.activeTabId
  )
  const selected = tabs.find((tab) => tab.id === selectedId) ?? tabs.at(-1)
  const consumeSuppressedPtyExit = useAppStore((s) => s.consumeSuppressedPtyExit)
  const select = (id: string): void => {
    useAppStore.getState().selectSidebarTerminal(worktreeId, id)
    focusTerminalTabSurface(id)
  }
  useEffect(() => () => useAppStore.getState().setSidebarTerminalFocused(false), [])
  const close = (id: string): void =>
    closeTerminalTab(id, {
      preserveWorktreeSelection: true,
      onClosed: () => useAppStore.getState().removeSidebarTerminal(worktreeId, id)
    })
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-sidebar-terminal-panel
      onFocusCapture={() => useAppStore.getState().setSidebarTerminalFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          useAppStore.getState().setSidebarTerminalFocused(false)
        }
      }}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
        <span className="text-sm font-medium">
          {cocosText('sidebar.terminal.title', 'Terminal')}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {workspace?.path.split(/[\\/]/).findLast(Boolean)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={cocosText('sidebar.terminal.history', 'Session history')}
          onClick={() => useAppStore.getState().setRightSidebarTab('vault')}
        >
          <History className="size-4" />
        </Button>
        <SidebarTerminalCreateMenu worktreeId={worktreeId} onCreated={select} />
      </div>
      {tabs.length > 0 && (
        <div
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-1 scrollbar-sleek"
          role="tablist"
          aria-label={cocosText('sidebar.terminal.sessions', 'Terminal sessions')}
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                'flex shrink-0 items-center rounded-md',
                selected?.id === tab.id && 'bg-accent'
              )}
            >
              <Button
                variant="ghost"
                size="sm"
                role="tab"
                aria-selected={selected?.id === tab.id}
                onClick={() => select(tab.id)}
                className="max-w-40"
              >
                <span className="truncate">
                  {tab.customTitle ?? tab.quickCommandLabel ?? tab.title}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={cocosText('sidebar.terminal.closeSession', 'Close {{name}}', {
                  name: tab.customTitle ?? tab.title
                })}
                onClick={() => close(tab.id)}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {selected && workspace ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {tabs.map((tab) => (
            <TerminalOverlaySlot
              key={tab.id}
              inline
              terminalTabId={tab.id}
              terminalGeneration={tab.generation}
              worktreeId={worktreeId}
              worktreePath={workspace.path}
              startupCwd={tab.startupCwd}
              groupId={undefined}
              isWorktreeActive
              isVisible={selected.id === tab.id}
              isActive={selected.id === tab.id}
              activityTerminalPortal={null}
              onFocusOwningGroup={undefined}
              consumeSuppressedPtyExit={consumeSuppressedPtyExit}
              captureEmptiedReaction={NO_REACTION}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground">
          <TerminalSquare className="size-6" />
          <span>
            {selected
              ? cocosText('sidebar.terminal.connecting', 'Connecting to terminal…')
              : cocosText(
                  'sidebar.terminal.empty',
                  'Open a terminal or choose an AI agent with +.'
                )}
          </span>
        </div>
      )}
    </div>
  )
}

export default function SidebarTerminalPanel(): React.JSX.Element | null {
  const worktreeId = useAppStore((s) => s.activeWorktreeId)
  return worktreeId ? <WorkspaceTerminals key={worktreeId} worktreeId={worktreeId} /> : null
}
