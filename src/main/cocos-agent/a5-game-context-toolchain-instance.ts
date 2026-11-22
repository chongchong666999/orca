import { BrowserWindow } from 'electron'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { runProcess } from '@orca/process-host'
import { getAppEnvironment } from '../../shared/app-lifecycle/app-environment'
import { A5_TOOLCHAIN_IPC } from '../../shared/cocos-agent/a5-game-context-toolchain-types'
import { hostShellEnvironment } from '../runtime/agent-session/environment/structured-agent-shell-environment'
import { removeLegacyA5GameContextRegistration } from './a5-game-context-legacy-registration'
import { A5GameContextToolchain } from './a5-game-context-toolchain'
import { publishCocosAgentFile } from './cocos-agent-file-publication'
import { a5ContextHomeDir } from './cocos-editor-running-services'

let toolchain: A5GameContextToolchain | null = null

/** The app's toolchain, created on first use (after Electron is ready, since it reads the app's paths). */
export function a5GameContextToolchain(): A5GameContextToolchain {
  toolchain ??= new A5GameContextToolchain({
    platform: process.platform,
    packaged: getAppEnvironment().isPackaged(),
    resourcesPath: process.resourcesPath,
    userData: getAppEnvironment().getPath('userData'),
    home: homedir(),
    contextHome: () => a5ContextHomeDir(),
    loginEnv: () => hostShellEnvironment(),
    run: (spec) => runProcess(spec),
    removeLegacyRegistration: () => removeLegacyA5GameContextRegistration(process.platform, homedir()),
    writeExecutable: async (file, content) => {
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
      await publishCocosAgentFile(file, content, 0o700)
    },
    emit: (status) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(A5_TOOLCHAIN_IPC.statusChanged, status)
        }
      }
    }
  })
  return toolchain
}
