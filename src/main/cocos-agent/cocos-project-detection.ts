import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type {
  CocosEditorRecord,
  CocosProjectDetection
} from '../../shared/cocos-agent/cocos-editor-types'

const MAX_MANIFEST_BYTES = 1024 * 1024
const GENERATED_DIRECTORIES = new Set(['node_modules', 'build', 'dist', 'library', 'temp'])

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

async function isCocosProjectRoot(projectRoot: string): Promise<boolean> {
  const [hasProjectJson, hasAssets] = await Promise.all([
    isFile(path.join(projectRoot, 'project.json')),
    isDirectory(path.join(projectRoot, 'assets'))
  ])
  return hasProjectJson && hasAssets
}

/** Prefer an exact project root. A repository wrapper is usable when it has one unambiguous child project. */
export async function resolveCocosProjectRoot(workspacePath: string): Promise<string | null> {
  const workspace = await realpath(workspacePath).catch(() => null)
  if (!workspace) {
    return null
  }
  if (await isCocosProjectRoot(workspace)) {
    return workspace
  }
  const entries = await readdir(workspace, { withFileTypes: true }).catch(() => [])
  let projectRoot: string | null = null
  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.name.startsWith('.') ||
      GENERATED_DIRECTORIES.has(entry.name)
    ) {
      continue
    }
    const child = path.join(workspace, entry.name)
    if (await isCocosProjectRoot(child)) {
      if (projectRoot) {
        return null
      }
      projectRoot = child
    }
  }
  return projectRoot
}

/** An exact running root is still addressable even if its files were removed after opening. */
export async function findCocosEditorForWorkspace(
  workspacePath: string,
  editors: readonly CocosEditorRecord[]
): Promise<CocosEditorRecord | undefined> {
  const workspace = await realpath(workspacePath).catch(() => path.resolve(workspacePath))
  const exact = editors.find((editor) => editor.projectRoot === workspace)
  if (exact || !editors.some((editor) => path.dirname(editor.projectRoot) === workspace)) {
    return exact
  }
  const root = await resolveCocosProjectRoot(workspace)
  return editors.find((editor) => editor.projectRoot === root)
}

export async function detectCocosProject(workspacePath: string): Promise<CocosProjectDetection> {
  const projectRoot = await resolveCocosProjectRoot(workspacePath)
  return projectRoot
    ? { kind: 'cocos', creatorVersion: await readCreatorVersion(projectRoot) }
    : { kind: 'not-cocos' }
}
