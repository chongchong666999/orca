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
  return sessions?.[worktreeId]?.tabIds.includes(tabId) === true
}

export function removeSidebarTerminalSession(
  sessions: SidebarTerminalSessions,
  worktreeId: string,
  tabId: string
): SidebarTerminalSessions {
  const current = sessions[worktreeId]
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
