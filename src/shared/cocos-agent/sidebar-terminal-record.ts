import {
  normalizeSidebarTerminalSessions,
  type SidebarTerminalSessions
} from '../sidebar-terminal-sessions'

/** What cocos-agent keeps in `userData/cocos-agent/sidebar-terminals.json`, outside upstream's UI state. */
export type SidebarTerminalRecord = {
  version: 1
  /** The first launch opens the Terminal tab at 420px; later launches keep whatever the user chose. */
  uiDefaultsApplied: boolean
  byWorktree: SidebarTerminalSessions
}

export const EMPTY_SIDEBAR_TERMINAL_RECORD: SidebarTerminalRecord = {
  version: 1,
  uiDefaultsApplied: false,
  byWorktree: {}
}

export function normalizeSidebarTerminalRecord(value: unknown): SidebarTerminalRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return EMPTY_SIDEBAR_TERMINAL_RECORD
  }
  return {
    version: 1,
    uiDefaultsApplied: 'uiDefaultsApplied' in value && value.uiDefaultsApplied === true,
    byWorktree: normalizeSidebarTerminalSessions(
      'byWorktree' in value ? value.byWorktree : undefined
    )
  }
}
