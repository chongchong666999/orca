import { BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import {
  registerA5GameContextCommands,
  reportA5GameContextCommands
} from './a5-game-context-commands'
import { refreshCocosEditorMcpLauncher } from './cocos-editor-mcp-launcher'
import { refreshCocosEditorBindings } from './cocos-editor-mcp-bindings'
import {
  COCOS_AGENT_IPC,
  type CocosEditorOpenResult,
  type CocosEditorRecord,
  type CocosProjectDetection
} from '../../shared/cocos-agent/cocos-editor-types'
import {
  describeCocosEditorCloseFailure,
  prepareCocosEditorClose,
  reportCocosEditorCloseFailure
} from './cocos-editor-close'
import { stopAppStartedEditorsOnQuit } from './cocos-editor-quit'
import { cocosEditorService, onCocosEditorEvicted } from './cocos-editor-service-instance'
import { detectCocosProject, findCocosEditorForWorkspace } from './cocos-project-detection'
import { readSidebarTerminalRecord, writeSidebarTerminalRecord } from './sidebar-terminal-store'

function isAbsolutePath(value: unknown): value is string {
  return typeof value === 'string' && path.isAbsolute(value)
}

let unsubscribeEvictions: (() => void) | undefined

export function registerCocosAgentIpc(): void {
  stopAppStartedEditorsOnQuit()
  cocosEditorService.setCloseHandlers(prepareCocosEditorClose, (outcome, forQuit) =>
    reportCocosEditorCloseFailure(describeCocosEditorCloseFailure(outcome === 'closing'), forQuit)
  )
  void refreshCocosEditorMcpLauncher().catch(() =>
    console.error('Could not update the bundled Cocos MCP launcher')
  )
  void registerA5GameContextCommands()
    .then(reportA5GameContextCommands)
    .catch((error) => console.error('Could not register the a5-game-context commands', error))
  unsubscribeEvictions?.()
  unsubscribeEvictions = onCocosEditorEvicted((record) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(COCOS_AGENT_IPC.editorEvicted, record)
      }
    }
  })
  for (const channel of Object.values(COCOS_AGENT_IPC)) {
    ipcMain.removeHandler(channel)
  }
  ipcMain.handle(COCOS_AGENT_IPC.refreshEditorBindings, async (_event, args: unknown) => {
    const value = args && typeof args === 'object' ? args : {}
    const projectPath = 'projectPath' in value ? value.projectPath : undefined
    const workspaceId = 'workspaceId' in value ? value.workspaceId : undefined
    const viewId = 'viewId' in value ? value.viewId : undefined
    if (
      !isAbsolutePath(projectPath) ||
      typeof workspaceId !== 'string' ||
      typeof viewId !== 'string' ||
      !viewId
    ) {
      throw new Error('Invalid editor binding refresh')
    }
    const editor = await findCocosEditorForWorkspace(projectPath, cocosEditorService.list())
    if (!editor) {
      throw new Error('Editor has not resumed')
    }
    await refreshCocosEditorBindings(editor, workspaceId, viewId, () =>
      cocosEditorService
        .list()
        .some((record) => record.projectRoot === editor.projectRoot && record.url === editor.url)
    )
  })
  ipcMain.handle(COCOS_AGENT_IPC.activateEditor, (_event, projectRoot: unknown) =>
    projectRoot === null || isAbsolutePath(projectRoot)
      ? cocosEditorService.activate(projectRoot)
      : undefined
  )
  ipcMain.handle(
    COCOS_AGENT_IPC.detectProject,
    (_event, projectPath: unknown): Promise<CocosProjectDetection> | CocosProjectDetection =>
      isAbsolutePath(projectPath) ? detectCocosProject(projectPath) : { kind: 'not-cocos' }
  )
  ipcMain.handle(
    COCOS_AGENT_IPC.openEditor,
    (_event, args: unknown): Promise<CocosEditorOpenResult> | CocosEditorOpenResult => {
      const value = args && typeof args === 'object' ? args : {}
      const projectPath = 'projectPath' in value ? value.projectPath : undefined
      const document = 'document' in value ? value.document : undefined
      if (!isAbsolutePath(projectPath)) {
        return { ok: false, code: 'not-cocos-project', message: 'projectPath must be absolute' }
      }
      if (document !== undefined && typeof document !== 'string') {
        return { ok: false, code: 'invalid-document', message: 'document must be a string' }
      }
      return cocosEditorService.open(projectPath, document)
    }
  )
  ipcMain.handle(
    COCOS_AGENT_IPC.stopEditor,
    (_event, projectRoot: unknown): Promise<boolean> | boolean =>
      isAbsolutePath(projectRoot) ? cocosEditorService.stop(projectRoot) : false
  )
  ipcMain.handle(COCOS_AGENT_IPC.listEditors, (): CocosEditorRecord[] => cocosEditorService.list())
  ipcMain.handle(COCOS_AGENT_IPC.readSidebarTerminals, () => readSidebarTerminalRecord())
  ipcMain.handle(COCOS_AGENT_IPC.writeSidebarTerminals, (_event, record: unknown) =>
    writeSidebarTerminalRecord(record)
  )
}
