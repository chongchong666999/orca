import type { A5ToolchainPreloadApi } from './a5-game-context-toolchain-types'
import type { SidebarTerminalRecord } from './sidebar-terminal-record'

export type CocosProjectDetection =
  | { kind: 'not-cocos' }
  | { kind: 'cocos'; creatorVersion: string | null }

export type CocosEditorFailureCode =
  | 'capacity'
  | 'unavailable'
  | 'not-cocos-project'
  | 'invalid-document'
  | 'start-failed'
  | 'timed-out'
  /** The previous editor acknowledged a stop but has not exited yet; retry shortly. */
  | 'stopping'

export type CocosEditorOpenResult =
  | { ok: true; url: string; projectRoot: string; reused: boolean }
  | { ok: false; code: CocosEditorFailureCode; message: string }

export type CocosEditorRecord = {
  projectRoot: string
  url: string
  /** False when the editor was already running (another app window, the CLI or an agent started it). */
  startedByApp: boolean
}

/** A running editor service: one this app opened, or one an agent or the CLI started (GitNexus's running notes). */
export type CocosRunningService = {
  projectRoot: string
  /** The page address with its session token; only the main process and the window that shows it use it. */
  url: string
  origin: 'app' | 'external'
  /** The port the service's preview server for devices listens on, when it has one. */
  previewPort: number | null
  unsavedDocuments: number
}

export type CocosStopAllFailure = {
  projectRoot: string
  /** `cancelled`: the unsaved-changes check failed; `closing`: accepted but still exiting; `refused`: rejected. */
  reason: 'cancelled' | 'closing' | 'refused'
}

export type CocosStopAllResult = {
  stopped: CocosEditorRecord[]
  failed: CocosStopAllFailure[]
}

export type CocosAgentPreloadApi = A5ToolchainPreloadApi & {
  detectProject: (projectPath: string) => Promise<CocosProjectDetection>
  openEditor: (args: { projectPath: string; document?: string }) => Promise<CocosEditorOpenResult>
  /** True once the editor stopped or had already exited; false keeps it listed so the stop can be retried. */
  stopEditor: (projectRoot: string) => Promise<boolean>
  listEditors: () => Promise<CocosEditorRecord[]>
  listServices: () => Promise<CocosRunningService[]>
  /** `preset` answers unsaved changes for every service at once; omitted when none has any. */
  stopAllServices: (preset?: 'save' | 'discard') => Promise<CocosStopAllResult>
  refreshEditorBindings: (args: {
    projectPath: string
    workspaceId: string
    viewId: string
  }) => Promise<void>
  activateEditor: (projectRoot: string | null) => Promise<void>
  onEditorEvicted: (listener: (record: CocosEditorRecord) => void) => () => void
  readSidebarTerminals: () => Promise<SidebarTerminalRecord>
  writeSidebarTerminals: (record: SidebarTerminalRecord) => Promise<void>
}

export const COCOS_AGENT_IPC = {
  refreshEditorBindings: 'cocos-agent:refresh-editor-bindings',
  activateEditor: 'cocos-agent:activate-editor',
  editorEvicted: 'cocos-agent:editor-evicted',
  detectProject: 'cocos-agent:detect-project',
  openEditor: 'cocos-agent:open-editor',
  stopEditor: 'cocos-agent:stop-editor',
  listEditors: 'cocos-agent:list-editors',
  listServices: 'cocos-agent:list-services',
  stopAllServices: 'cocos-agent:stop-all-services',
  readSidebarTerminals: 'cocos-agent:read-sidebar-terminals',
  writeSidebarTerminals: 'cocos-agent:write-sidebar-terminals'
} as const
