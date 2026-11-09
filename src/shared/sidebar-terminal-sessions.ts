export type SidebarTerminalSessions = Record<
  string,
  { tabIds: string[]; activeTabId: string | null }
>

export function normalizeSidebarTerminalSessions(value: unknown): SidebarTerminalSessions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([workspaceId, entry]) => {
      if (!entry || typeof entry !== 'object' || !Array.isArray(entry.tabIds)) {
        return []
      }
      const tabIds = [
        ...new Set<string>(
          entry.tabIds.filter((id: unknown) => typeof id === 'string' && id.length > 0)
        )
      ]
      return tabIds.length
        ? [
            [
              workspaceId,
              {
                tabIds,
                activeTabId: tabIds.includes(entry.activeTabId) ? entry.activeTabId : tabIds.at(-1)!
              }
            ]
          ]
        : []
    })
  )
}

export function isSidebarTerminal(
  sessions: SidebarTerminalSessions | undefined,
  worktreeId: string,
  tabId: string
): boolean {
  return Boolean(
    sessions && Object.hasOwn(sessions, worktreeId) && sessions[worktreeId].tabIds.includes(tabId)
  )
}

export function selectSidebarTerminalSession(
  sessions: SidebarTerminalSessions,
  worktreeId: string,
  tabId: string
): SidebarTerminalSessions {
  const current = Object.hasOwn(sessions, worktreeId) ? sessions[worktreeId] : undefined
  if (current?.activeTabId === tabId && current.tabIds.includes(tabId)) {
    return sessions
  }
  return {
    ...sessions,
    [worktreeId]: {
      tabIds: current?.tabIds.includes(tabId)
        ? current.tabIds
        : [...(current?.tabIds ?? []), tabId],
      activeTabId: tabId
    }
  }
}

/** The terminals a workspace shows in the central tab strip: every tab the sidebar has not taken. */
export function selectCentralTerminalTabs<T extends { id: string }>(
  state: {
    tabsByWorktree: Record<string, T[] | undefined>
    sidebarTerminalSessionsByWorktree?: SidebarTerminalSessions
  },
  worktreeId: string
): T[] {
  const tabs = state.tabsByWorktree[worktreeId] ?? []
  const taken = state.sidebarTerminalSessionsByWorktree?.[worktreeId]?.tabIds
  return taken?.length ? tabs.filter((tab) => !taken.includes(tab.id)) : tabs
}

/** The sidebar assignments after a terminal tab closed; nothing to merge when it was never in the sidebar. */
export function sidebarSessionsAfterTabClosed(
  state: { sidebarTerminalSessionsByWorktree?: SidebarTerminalSessions },
  worktreeId: string | null | undefined,
  tabId: string
): { sidebarTerminalSessionsByWorktree?: SidebarTerminalSessions } {
  const sessions = state.sidebarTerminalSessionsByWorktree
  if (!worktreeId || !sessions) {
    return {}
  }
  const next = removeSidebarTerminalSession(sessions, worktreeId, tabId)
  return next === sessions ? {} : { sidebarTerminalSessionsByWorktree: next }
}

export function removeSidebarTerminalSession(
  sessions: SidebarTerminalSessions,
  worktreeId: string,
  tabId: string
): SidebarTerminalSessions {
  const current = Object.hasOwn(sessions, worktreeId) ? sessions[worktreeId] : undefined
  if (!current?.tabIds.includes(tabId)) {
    return sessions
  }
  const tabIds = current.tabIds.filter((id) => id !== tabId)
  const next = { ...sessions }
  if (tabIds.length) {
    next[worktreeId] = {
      tabIds,
      activeTabId: current.activeTabId === tabId ? tabIds.at(-1)! : current.activeTabId
    }
  } else {
    delete next[worktreeId]
  }
  return next
}
