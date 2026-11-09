import { useAppStore } from '@/store'
import type { SidebarTerminalSessions } from '../../../shared/sidebar-terminal-sessions'

const WRITE_DELAY_MS = 300
let installed = false

/** Loads the sidebar assignments from cocos-agent's own file and writes them back as they change. */
export function installSidebarTerminalPersistence(): void {
  const api = window.cocosAgent
  // The web client has no preload: assignments then live only for the session, terminals stay in the tab strip.
  if (installed || !api?.readSidebarTerminals) {
    return
  }
  installed = true
  void api
    .readSidebarTerminals()
    .then((record) => {
      const state = useAppStore.getState()
      state.hydrateSidebarTerminalSessions(record.byWorktree)
      if (!record.uiDefaultsApplied) {
        state.setRightSidebarTab('terminal')
        state.setRightSidebarWidth(420)
        state.setRightSidebarOpen(true)
      }
      let written: SidebarTerminalSessions =
        useAppStore.getState().sidebarTerminalSessionsByWorktree
      let timer: ReturnType<typeof setTimeout> | null = null
      useAppStore.subscribe((s) => {
        const sessions = s.sidebarTerminalSessionsByWorktree
        if (sessions === written || timer !== null) {
          return
        }
        timer = setTimeout(() => {
          timer = null
          const latest = useAppStore.getState().sidebarTerminalSessionsByWorktree
          if (latest === written) {
            return
          }
          written = latest
          void api
            .writeSidebarTerminals({ version: 1, uiDefaultsApplied: true, byWorktree: latest })
            .catch((error: unknown) =>
              console.warn('[cocos-agent] sidebar terminals not saved', error)
            )
        }, WRITE_DELAY_MS)
      })
    })
    .catch((error: unknown) => console.warn('[cocos-agent] sidebar terminals not loaded', error))
}
