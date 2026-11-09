import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { isSidebarTerminal } from '../../../shared/sidebar-terminal-sessions'

/** `tabs` minus the ones the right sidebar shows for `worktreeId`; the same array when none are. */
export function useCentralTerminalTabs<T extends { id: string }>(
  worktreeId: string | null | undefined,
  tabs: T[]
): T[] {
  // Why: upstream tests mock the store with partial state, where this slice is absent.
  const sessions = useAppStore((s) =>
    worktreeId ? s.sidebarTerminalSessionsByWorktree?.[worktreeId] : undefined
  )
  return useMemo(
    () =>
      sessions?.tabIds.length ? tabs.filter((tab) => !sessions.tabIds.includes(tab.id)) : tabs,
    [tabs, sessions]
  )
}

/** For the legacy pane list: which tabs the sidebar owns, and whether it currently holds focus. */
export function useLegacyPaneSidebarState(): {
  hides: (worktreeId: string, tabId: string) => boolean
  active: (central: boolean) => boolean
} {
  const sessions = useAppStore((s) => s.sidebarTerminalSessionsByWorktree)
  const focused = useAppStore((s) => s.sidebarTerminalFocused)
  return useMemo(
    () => ({
      hides: (worktreeId, tabId) => isSidebarTerminal(sessions, worktreeId, tabId),
      active: (central) => !focused && central
    }),
    [sessions, focused]
  )
}
