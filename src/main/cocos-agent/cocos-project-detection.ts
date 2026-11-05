import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { CocosProjectDetection } from '../../shared/cocos-agent/cocos-editor-types'

const MAX_MANIFEST_BYTES = 1024 * 1024

async function isFile(target: string): Promise<boolean> {
  return stat(target).then(
    (info) => info.isFile(),
    () => false
  )
}

async function isDirectory(target: string): Promise<boolean> {
  return stat(target).then(
    (info) => info.isDirectory(),
    () => false
  )
}

async function readJsonObject(file: string): Promise<Record<string, unknown> | null> {
  try {
    const info = await stat(file)
    if (!info.isFile() || info.size > MAX_MANIFEST_BYTES) {
      return null
    }
    const value: unknown = JSON.parse(await readFile(file, 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

// Why: 2.x stamps project.json `version`; 3.x stamps package.json `creator.version`.
async function readCreatorVersion(projectRoot: string): Promise<string | null> {
  const projectJson = await readJsonObject(path.join(projectRoot, 'project.json'))
  if (typeof projectJson?.version === 'string') {
    return projectJson.version
  }
  const packageJson = await readJsonObject(path.join(projectRoot, 'package.json'))
  const creator = packageJson?.creator
  if (creator && typeof creator === 'object' && 'version' in creator) {
    return typeof creator.version === 'string' ? creator.version : null
  }
  return null
}

/** Same rule as the GitNexus editor and Creator's Dashboard: a project.json file and an assets folder. */
export async function detectCocosProject(projectRoot: string): Promise<CocosProjectDetection> {
  const [hasProjectJson, hasAssets] = await Promise.all([
    isFile(path.join(projectRoot, 'project.json')),
    isDirectory(path.join(projectRoot, 'assets'))
  ])
  if (!hasProjectJson || !hasAssets) {
    return { kind: 'not-cocos' }
  }
  return { kind: 'cocos', creatorVersion: await readCreatorVersion(projectRoot) }
}
