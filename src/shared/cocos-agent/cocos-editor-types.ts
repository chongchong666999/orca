export type CocosProjectDetection =
  | { kind: 'not-cocos' }
  | { kind: 'cocos'; creatorVersion: string | null }

export type CocosEditorFailureCode =
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

export type CocosAgentPreloadApi = {
  detectProject: (projectPath: string) => Promise<CocosProjectDetection>
  openEditor: (args: { projectPath: string; document?: string }) => Promise<CocosEditorOpenResult>
  /** True once the editor stopped or had already exited; false keeps it listed so the stop can be retried. */
  stopEditor: (projectRoot: string) => Promise<boolean>
  listEditors: () => Promise<CocosEditorRecord[]>
}

export const COCOS_AGENT_IPC = {
  detectProject: 'cocos-agent:detect-project',
  openEditor: 'cocos-agent:open-editor',
  stopEditor: 'cocos-agent:stop-editor',
  listEditors: 'cocos-agent:list-editors'
} as const
