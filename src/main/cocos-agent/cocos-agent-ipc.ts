import { ipcMain } from 'electron'
import path from 'node:path'
import {
  COCOS_AGENT_IPC,
  type CocosEditorOpenResult,
  type CocosEditorRecord,
  type CocosProjectDetection
} from '../../shared/cocos-agent/cocos-editor-types'
import { stopAppStartedEditorsOnQuit } from './cocos-editor-quit'
import { cocosEditorService } from './cocos-editor-service'
import { detectCocosProject } from './cocos-project-detection'

function isAbsolutePath(value: unknown): value is string {
  return typeof value === 'string' && path.isAbsolute(value)
}

export function registerCocosAgentIpc(): void {
  stopAppStartedEditorsOnQuit()
  for (const channel of Object.values(COCOS_AGENT_IPC)) {
    ipcMain.removeHandler(channel)
  }
  ipcMain.handle(
    COCOS_AGENT_IPC.detectProject,
    (_event, projectPath: unknown): Promise<CocosProjectDetection> | CocosProjectDetection =>
      isAbsolutePath(projectPath) ? detectCocosProject(projectPath) : { kind: 'not-cocos' }
  )
  ipcMain.handle(
    COCOS_AGENT_IPC.openEditor,
    (_event, args: unknown): Promise<CocosEditorOpenResult> | CocosEditorOpenResult => {
      const { projectPath, document } = (args ?? {}) as {
        projectPath?: unknown
        document?: unknown
      }
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
}
