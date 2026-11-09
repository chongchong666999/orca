import type { AppState } from '@/store/types'
import { resolveActiveTabOwnerWorktreeId } from '@/store/slices/active-tab-owner-worktree'
import {
  isSidebarTerminal,
  selectSidebarTerminalSession
} from '../../../shared/sidebar-terminal-sessions'

type SidebarRouteState = Pick<
  AppState,
  'sidebarTerminalSessionsByWorktree' | 'rightSidebarRouteRequestId'
>

/** Activating a tab the sidebar owns opens the sidebar on it instead; the partial state to return, or null. */
export function routeTerminalTabToSidebarState(
  state: SidebarRouteState,
  worktreeId: string,
  tab: { contentType: string; entityId: string }
): Partial<AppState> | null {
  if (
    tab.contentType !== 'terminal' ||
    !isSidebarTerminal(state.sidebarTerminalSessionsByWorktree, worktreeId, tab.entityId)
  ) {
    return null
  }
  return {
    rightSidebarOpen: true,
    rightSidebarTab: 'terminal',
    rightSidebarRouteRequestId: state.rightSidebarRouteRequestId + 1,
    sidebarTerminalSessionsByWorktree: selectSidebarTerminalSession(
      state.sidebarTerminalSessionsByWorktree,
      worktreeId,
      tab.entityId
    )
  }
}

/** `setActiveTab` for a sidebar-owned terminal: select it there and show the sidebar. True when handled. */
export function routeTerminalTabToSidebar(
  state: Pick<
    AppState,
    | 'tabsByWorktree'
    | 'activeWorktreeId'
    | 'sidebarTerminalSessionsByWorktree'
    | 'selectSidebarTerminal'
    | 'setRightSidebarOpen'
    | 'setRightSidebarTab'
  >,
  tabId: string | null
): boolean {
  if (!tabId) {
    return false
  }
  const owner = resolveActiveTabOwnerWorktreeId(state.tabsByWorktree, state.activeWorktreeId, tabId)
  if (!owner || !isSidebarTerminal(state.sidebarTerminalSessionsByWorktree, owner, tabId)) {
    return false
  }
  state.selectSidebarTerminal(owner, tabId)
  state.setRightSidebarOpen(true)
  state.setRightSidebarTab('terminal')
  return true
}
