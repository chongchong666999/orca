import { access, constants } from 'node:fs/promises'
import path from 'node:path'

/** Development override: an a5-game-context build (for example GitNexus's native-engine/bin/<platform>/a5-game-context). */
export const A5_GAME_CONTEXT_BIN_ENV = 'A5_GAME_CONTEXT_BIN'

async function isExecutable(file: string): Promise<boolean> {
  return access(file, constants.X_OK).then(
    () => true,
    () => false
  )
}

/** The env override, else the launcher packaged into Resources/bin; null when neither exists. */
export async function resolveA5GameContextBinary(
  env: NodeJS.ProcessEnv = process.env,
  resourcesPath: string | undefined = process.resourcesPath
): Promise<string | null> {
  const candidates = [
    env[A5_GAME_CONTEXT_BIN_ENV],
    resourcesPath ? path.join(resourcesPath, 'bin', 'a5-game-context') : undefined
  ]
  for (const candidate of candidates) {
    if (candidate && path.isAbsolute(candidate) && (await isExecutable(candidate))) {
      return candidate
    }
  }
  return null
}
