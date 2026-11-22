import { access, constants } from 'node:fs/promises'
import path from 'node:path'
import { WINDOWS_A5_GAME_CONTEXT_BIN } from './a5-game-context-windows-user-path'

/** Development override: an a5-game-context build (for example GitNexus's native-engine/bin/<platform>/a5-game-context). */
export const A5_GAME_CONTEXT_BIN_ENV = 'A5_GAME_CONTEXT_BIN'

/** The launcher the packaged app ships; Windows keeps its .cmd in the folder that goes on the user PATH. */
export function bundledA5GameContextLauncher(resourcesPath: string): string {
  return process.platform === 'win32'
    ? path.join(resourcesPath, WINDOWS_A5_GAME_CONTEXT_BIN, 'a5-game-context.cmd')
    : path.join(resourcesPath, 'bin', 'a5-game-context')
}

async function isExecutable(file: string): Promise<boolean> {
  return access(file, constants.X_OK).then(
    () => true,
    () => false
  )
}

let globalLauncher: (() => Promise<string | null>) | null = null

/** Set once at startup: the launcher of the npm global copy while it is usable (a5-game-context-toolchain). */
export function setGlobalA5GameContextLauncher(
  resolve: (() => Promise<string | null>) | null
): void {
  globalLauncher = resolve
}

/** The env override, else the npm global copy every terminal uses, else the packaged launcher; null when none exists. */
export async function resolveA5GameContextBinary(
  env: NodeJS.ProcessEnv = process.env,
  resourcesPath: string | undefined = process.resourcesPath
): Promise<string | null> {
  const override = env[A5_GAME_CONTEXT_BIN_ENV]
  const global = await (globalLauncher?.() ?? Promise.resolve(null)).catch(() => null)
  const candidates = [
    override,
    global,
    resourcesPath ? bundledA5GameContextLauncher(resourcesPath) : undefined
  ]
  for (const candidate of candidates) {
    if (candidate && path.isAbsolute(candidate) && (await isExecutable(candidate))) {
      return candidate
    }
  }
  return null
}
