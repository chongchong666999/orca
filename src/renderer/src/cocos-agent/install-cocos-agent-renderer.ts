import { installToolchainNotices } from './a5-game-context-toolchain-notices'
import { mountCocosAgentOverlay } from './cocos-agent-overlay-root'
import { installRestoredEditorTabRefresh } from './cocos-editor-tab-refresh'
import { installSidebarTerminalPersistence } from './sidebar-terminal-persistence'

/** The one renderer entry point upstream's main.tsx calls; everything cocos-agent starts at boot hangs off it. */
export function installCocosAgentRenderer(): void {
  installRestoredEditorTabRefresh()
  installSidebarTerminalPersistence()
  installToolchainNotices()
  mountCocosAgentOverlay()
}
