import { contextBridge, ipcRenderer } from 'electron'
import {
  A5_TOOLCHAIN_IPC,
  type A5ToolchainStatus
} from '../shared/cocos-agent/a5-game-context-toolchain-types'
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
  listServices: () => ipcRenderer.invoke(COCOS_AGENT_IPC.listServices),
  stopAllServices: (preset) => ipcRenderer.invoke(COCOS_AGENT_IPC.stopAllServices, preset),
  readSidebarTerminals: () => ipcRenderer.invoke(COCOS_AGENT_IPC.readSidebarTerminals),
  writeSidebarTerminals: (record) =>
    ipcRenderer.invoke(COCOS_AGENT_IPC.writeSidebarTerminals, record),
  getToolchainStatus: () => ipcRenderer.invoke(A5_TOOLCHAIN_IPC.getStatus),
  refreshToolchain: () => ipcRenderer.invoke(A5_TOOLCHAIN_IPC.refresh),
  installToolchain: (options) => ipcRenderer.invoke(A5_TOOLCHAIN_IPC.install, options),
  setToolchainAutoInstall: (enabled) =>
    ipcRenderer.invoke(A5_TOOLCHAIN_IPC.setAutoInstall, enabled),
  openToolchainLog: () => ipcRenderer.invoke(A5_TOOLCHAIN_IPC.openLog),
  onToolchainStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: A5ToolchainStatus): void =>
      listener(status)
    ipcRenderer.on(A5_TOOLCHAIN_IPC.statusChanged, handler)
    return () => {
      ipcRenderer.removeListener(A5_TOOLCHAIN_IPC.statusChanged, handler)
    }
  }
}

// Why: its own global keeps cocos-agent out of upstream's PreloadApi, so syncing Orca never conflicts there.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('cocosAgent', cocosAgentApi)
  } catch (error) {
    console.error(error)
  }
} else {
  Object.assign(window, { cocosAgent: cocosAgentApi })
}
