import { contextBridge, ipcRenderer } from 'electron'
import {
  COCOS_AGENT_IPC,
  type CocosEditorRecord,
  type CocosAgentPreloadApi
} from '../shared/cocos-agent/cocos-editor-types'

const cocosAgentApi: CocosAgentPreloadApi = {
  refreshEditorBindings: (args) => ipcRenderer.invoke(COCOS_AGENT_IPC.refreshEditorBindings, args),
  activateEditor: (projectRoot) => ipcRenderer.invoke(COCOS_AGENT_IPC.activateEditor, projectRoot),
  onEditorEvicted: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, record: CocosEditorRecord): void =>
      listener(record)
    ipcRenderer.on(COCOS_AGENT_IPC.editorEvicted, handler)
    return () => {
      ipcRenderer.removeListener(COCOS_AGENT_IPC.editorEvicted, handler)
    }
  },
  detectProject: (projectPath) => ipcRenderer.invoke(COCOS_AGENT_IPC.detectProject, projectPath),
  openEditor: (args) => ipcRenderer.invoke(COCOS_AGENT_IPC.openEditor, args),
  stopEditor: (projectRoot) => ipcRenderer.invoke(COCOS_AGENT_IPC.stopEditor, projectRoot),
  listEditors: () => ipcRenderer.invoke(COCOS_AGENT_IPC.listEditors),
  readSidebarTerminals: () => ipcRenderer.invoke(COCOS_AGENT_IPC.readSidebarTerminals),
  writeSidebarTerminals: (record) =>
    ipcRenderer.invoke(COCOS_AGENT_IPC.writeSidebarTerminals, record)
}

// Why: its own global keeps cocos-agent out of upstream's PreloadApi, so syncing Orca never conflicts there.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('cocosAgent', cocosAgentApi)
  } catch (error) {
    console.error(error)
  }
} else {
  ;(window as Window & { cocosAgent?: CocosAgentPreloadApi }).cocosAgent = cocosAgentApi
}
