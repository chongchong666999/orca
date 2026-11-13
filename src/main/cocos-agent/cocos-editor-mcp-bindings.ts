import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { getAppEnvironment } from '../../shared/app-environment'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import type { CocosEditorRecord } from '../../shared/cocos-agent/cocos-editor-types'

export type CocosEditorBinding = {
  instanceId: string
  viewId: string
  projectRoot: string
  url: string
  token: string
  capabilities: string[]
  workspaceId?: string
}

const notifiedLegacyProjects = new Set<string>()

/** GitNexus reports Windows roots in their `\\?\` form, which Node's realpath never returns. */
function isSameProjectRoot(reported: string, projectRoot: string): boolean {
  if (process.platform !== 'win32') {
    return reported === projectRoot
  }
  return (
    path.win32.toNamespacedPath(reported).toLowerCase() ===
    path.win32.toNamespacedPath(projectRoot).toLowerCase()
  )
}

export function registerCocosEditorBinding(
  file: string,
  binding: CocosEditorBinding,
  workspaceId?: string
): void {
  if (workspaceId) {
    writeFileAtomically(file, JSON.stringify({ ...binding, workspaceId }), { mode: 0o600 })
  }
}

async function discoverCocosEditorBindings(): Promise<
  { file: string; binding: Pick<CocosEditorBinding, 'projectRoot' | 'viewId' | 'workspaceId'> }[]
> {
  const root = path.join(getAppEnvironment().getPath('userData'), 'cocos-editor-sessions')
  const directories = await readdir(root, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return []
      }
      throw error
    }
  )
  const records = await Promise.all(
    directories
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('session-'))
      .map(async (entry) => {
        const file = path.join(root, entry.name, 'binding.json')
        try {
          if (!(await lstat(file)).isFile()) {
            return null
          }
          const binding = z
            .object({
              workspaceId: z.string().optional(),
              projectRoot: z.string(),
              viewId: z.string().min(1)
            })
            .safeParse(JSON.parse(await readFile(file, 'utf8')))
          return binding.success ? { file, binding: binding.data } : null
        } catch {
          return null
        }
      })
  )
  return records.filter((record) => record !== null)
}

export async function readCocosEditorBinding(
  editor: CocosEditorRecord,
  workspaceId?: string,
  expectedViewId?: string
): Promise<CocosEditorBinding> {
  const url = new URL(editor.url)
  const token = url.searchParams.get('token')
  if (!token) {
    throw new Error('编辑器连接信息不完整，请重新打开编辑器。')
  }
  const endpoint = new URL('/editor/binding', url)
  endpoint.searchParams.set('token', token)
  if (workspaceId) {
    endpoint.searchParams.set('workspaceId', workspaceId)
  }
  if (expectedViewId) {
    endpoint.searchParams.set('viewId', expectedViewId)
  }
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000), redirect: 'error' })
  if (!response.ok) {
    throw new Error('当前编辑器尚不支持 AI 连接，请用新版重新打开项目。')
  }
  const value: unknown = await response.json()
  const parsed = z
    .object({
      instanceId: z.string().min(1),
      viewId: z.string().min(1),
      projectRoot: z.string(),
      capabilities: z.array(z.string()),
      workspaceId: z.string().optional()
    })
    .safeParse(value)
  const bindingError =
    value && typeof value === 'object' && 'error' in value && value.error
      ? String(value.error)
      : undefined
  if (
    bindingError ||
    !parsed.success ||
    !isSameProjectRoot(parsed.data.projectRoot, editor.projectRoot) ||
    !parsed.data.capabilities.includes('editor-context-v1')
  ) {
    const detail = bindingError ?? '版本不匹配'
    throw new Error(`无法绑定当前编辑器页面：${detail}。请保留一个当前项目编辑器页面后重试。`)
  }
  const binding = parsed.data
  return {
    ...binding,
    instanceId: binding.instanceId,
    viewId: binding.viewId,
    projectRoot: editor.projectRoot,
    capabilities: binding.capabilities,
    url: `${url.origin}/`,
    token
  }
}

export async function refreshCocosEditorBindings(
  editor: CocosEditorRecord,
  workspaceId: string,
  viewId: string,
  isCurrent: () => boolean
): Promise<void> {
  const discovered = await discoverCocosEditorBindings()
  const sessions = discovered.filter(
    ({ binding }) =>
      binding.workspaceId === workspaceId &&
      binding.projectRoot === editor.projectRoot &&
      binding.viewId === viewId
  )
  if (sessions.length === 0) {
    if (
      !notifiedLegacyProjects.has(editor.projectRoot) &&
      discovered.some(
        ({ binding }) => binding.projectRoot === editor.projectRoot && !binding.workspaceId
      )
    ) {
      notifiedLegacyProjects.add(editor.projectRoot)
      throw new Error(
        '检测到旧版 AI 连接配置，缺少工作区归属信息。继续使用旧终端需要一次性重新配置并重启内置 Cocos MCP；也可新建 Claude/Codex 会话。'
      )
    }
    return
  }
  const deadline = Date.now() + 60_000
  while (isCurrent()) {
    let binding: CocosEditorBinding
    try {
      binding = await readCocosEditorBinding(editor, workspaceId, viewId)
    } catch (error) {
      if (
        Date.now() >= deadline ||
        !(error instanceof Error) ||
        !error.message.includes('NO_EDITOR_VIEW')
      ) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
      continue
    }
    if (binding.viewId !== viewId) {
      throw new Error('编辑器页面已改变，原终端保持断开。请从当前页面新建终端。')
    }
    if (!isCurrent()) {
      break
    }
    for (const { file } of sessions) {
      writeFileAtomically(file, JSON.stringify({ ...binding, workspaceId }), { mode: 0o600 })
    }
    return
  }
  throw new Error('编辑器实例已改变，AI 连接尚未恢复。请恢复当前编辑器后重试。')
}
