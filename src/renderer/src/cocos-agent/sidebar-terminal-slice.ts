import type { StateCreator } from 'zustand'
import type { AppState } from '@/store/types'
import {
  normalizeSidebarTerminalSessions,
  removeSidebarTerminalSession,
  selectSidebarTerminalSession,
  type SidebarTerminalSessions
} from '../../../shared/sidebar-terminal-sessions'

/** Which terminals the right sidebar shows per workspace, and whether it owns keyboard focus. */
export type SidebarTerminalSlice = {
  sidebarTerminalSessionsByWorktree: SidebarTerminalSessions
  sidebarTerminalFocused: boolean
  setSidebarTerminalFocused: (focused: boolean) => void
  selectSidebarTerminal: (worktreeId: string, tabId: string) => void
  removeSidebarTerminal: (worktreeId: string, tabId: string) => void
  hydrateSidebarTerminalSessions: (sessions: unknown) => void
}

// Why: a slice of cocos-agent's own keeps upstream's right-sidebar state and persisted UI schema untouched.
export const createSidebarTerminalSlice: StateCreator<AppState, [], [], SidebarTerminalSlice> = (
  set
) => ({
  sidebarTerminalSessionsByWorktree: {},
  sidebarTerminalFocused: false,
  setSidebarTerminalFocused: (focused) => set({ sidebarTerminalFocused: focused }),
  selectSidebarTerminal: (worktreeId, tabId) =>
    set((s) => {
      const sessions = selectSidebarTerminalSession(
        s.sidebarTerminalSessionsByWorktree,
        worktreeId,
        tabId
      )
      return sessions === s.sidebarTerminalSessionsByWorktree
        ? s
        : { sidebarTerminalSessionsByWorktree: sessions }
    }),
  removeSidebarTerminal: (worktreeId, tabId) =>
    set((s) => {
      const sessions = removeSidebarTerminalSession(
        s.sidebarTerminalSessionsByWorktree,
        worktreeId,
        tabId
      )
      return sessions === s.sidebarTerminalSessionsByWorktree
        ? s
        : { sidebarTerminalSessionsByWorktree: sessions }
    }),
  hydrateSidebarTerminalSessions: (sessions) =>
    set({ sidebarTerminalSessionsByWorktree: normalizeSidebarTerminalSessions(sessions) })
})
