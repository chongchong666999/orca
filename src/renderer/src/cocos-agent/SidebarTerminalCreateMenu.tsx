import { useMemo, useRef, useState } from 'react'
import { Plus, TerminalSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu'
import { useAgentDetectionTargetForWorktree } from '@/lib/agent-session/launch/inventory/useAgentDetectionTarget'
import { useNewTabAgentMenuRows } from '@/components/agent/launch-menu/use-new-tab-agent-menu-rows'
import { ProjectedAgentMenuItems } from '@/components/agent/launch-menu/AgentMenuItems'
import { useAgentLaunchPickerInventorySource } from '@/components/agent/use-agent-launch-picker-inventory'
import { orderAgentLaunchPickerAgents } from '../../../shared/agent-launch/picker/agent-launch-picker-rows'
import type { AgentPickerEntry } from '../../../shared/agent-launch/picker/agent-launch-picker'
import { useTranslate } from '@/i18n/use-translate'
import { cocosText } from '@/cocos-agent/cocos-text'
import { openSidebarAgent, openSidebarTerminal } from './sidebar-terminal-launch'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import { isSidebarTerminal } from '../../../shared/sidebar-terminal-sessions'

async function createTerminal(operation: () => Promise<string | null>): Promise<string | null> {
  try {
    return await operation()
  } catch {
    return null
  }
}

export function SidebarTerminalCreateMenu({
  worktreeId,
  onCreated
}: {
  worktreeId: string
  onCreated: (tabId: string) => void
}): React.JSX.Element {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const existingTerminals = useAppStore(
    useShallow((s) =>
      (s.tabsByWorktree[worktreeId] ?? []).filter(
        (tab) => !isSidebarTerminal(s.sidebarTerminalSessionsByWorktree, worktreeId, tab.id)
      )
    )
  )
  const [selectedAgent, setSelectedAgent] = useState<AgentPickerEntry['agent']>()
  const target = useAgentDetectionTargetForWorktree(worktreeId)
  const observed = useNewTabAgentMenuRows(worktreeId, open, target, { wakeOnOpen: true })
  const model = useMemo(
    () =>
      observed.state === 'loading'
        ? observed
        : {
            ...observed,
            rows: orderAgentLaunchPickerAgents(
              observed.defaultTuiAgent,
              (observed.detection.detectedIds ?? []).filter((agent) =>
                observed.rows.some((row) => row.agent === agent)
              )
            ).map((agent) => ({
              agent,
              kind: 'terminal' as const,
              executionHostId: observed.rows.find((row) => row.agent === agent)?.executionHostId
            }))
          },
    [observed]
  )
  const inventory = useAgentLaunchPickerInventorySource(worktreeId, model, open, selectedAgent)
  const create = async (operation: () => Promise<string | null>): Promise<boolean> => {
    if (pendingRef.current) {
      return false
    }
    pendingRef.current = true
    setPending(true)
    const tabId = await createTerminal(operation)
    pendingRef.current = false
    setPending(false)
    if (!tabId) {
      toast.error(
        cocosText(
          'sidebar.terminal.createFailed',
          'Could not open the terminal. Check the workspace connection and agent settings.'
        )
      )
      return false
    }
    onCreated(tabId)
    setOpen(false)
    return true
  }
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          aria-label={cocosText('sidebar.terminal.newSession', 'New session')}
        >
          <Plus className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem
          disabled={pending}
          onSelect={() => void create(() => openSidebarTerminal(worktreeId))}
        >
          <TerminalSquare className="size-4" />
          {t('auto.components.tab.bar.TabBar.d364f3c8d4', 'New Terminal')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {existingTerminals.length > 0 && (
          <>
            <DropdownMenuLabel>
              {cocosText('sidebar.terminal.moveExisting', 'Move existing terminal here')}
            </DropdownMenuLabel>
            {existingTerminals.map((tab) => (
              <DropdownMenuItem
                key={tab.id}
                onSelect={() => {
                  const state = useAppStore.getState()
                  const fallback = state.unifiedTabsByWorktree[worktreeId]?.findLast(
                    (item) =>
                      item.entityId !== tab.id &&
                      !isSidebarTerminal(
                        state.sidebarTerminalSessionsByWorktree,
                        worktreeId,
                        item.entityId
                      )
                  )
                  if (
                    state.activeTabId === tab.id &&
                    state.activeTabType === 'terminal' &&
                    fallback
                  ) {
                    state.activateTab(fallback.id, { worktreeId })
                  }
                  onCreated(tab.id)
                }}
              >
                {tab.customTitle ?? tab.quickCommandLabel ?? tab.title}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <ProjectedAgentMenuItems
          model={model}
          disabled={pending}
          pickerInventory={inventory}
          onSelectPickerAgent={setSelectedAgent}
          runLaunch={(row, draft, entry) =>
            create(() => openSidebarAgent(worktreeId, row, draft, entry))
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
