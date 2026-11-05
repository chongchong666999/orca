import { contextBridge, ipcRenderer } from 'electron'
import {
  COCOS_AGENT_IPC,
  type CocosAgentPreloadApi
} from '../shared/cocos-agent/cocos-editor-types'

const cocosAgentApi: CocosAgentPreloadApi = {
  detectProject: (projectPath) => ipcRenderer.invoke(COCOS_AGENT_IPC.detectProject, projectPath),
  openEditor: (args) => ipcRenderer.invoke(COCOS_AGENT_IPC.openEditor, args),
  stopEditor: (projectRoot) => ipcRenderer.invoke(COCOS_AGENT_IPC.stopEditor, projectRoot),
  listEditors: () => ipcRenderer.invoke(COCOS_AGENT_IPC.listEditors)
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
