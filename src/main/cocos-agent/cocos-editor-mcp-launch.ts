import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import { insertAgentStartupArgs } from '../../shared/agent-launch/startup/insert-agent-startup-args'
import type { AgentStartupShell } from '../../shared/agent-launch/startup/tui-agent-startup-shell'
import { resolveA5GameContextBinary } from './a5-game-context-binary'
import { cocosEditorService } from './cocos-editor-service'

export async function prepareCocosEditorMcpLaunch(input: {
  command: string | undefined
  agent: string | undefined
  cwd: string | undefined
  worktreeId: string | undefined
  local: boolean
  shell: AgentStartupShell
}): Promise<string | undefined> {
  if (
    !input.local ||
    !input.command ||
    !input.cwd ||
    (input.agent !== 'claude' && input.agent !== 'codex')
  ) {
    return input.command
  }
  const requestedCwd = input.cwd
  const cwd = await realpath(requestedCwd).catch(() => requestedCwd)
  const editor = cocosEditorService
    .list()
    .sort((a, b) => b.projectRoot.length - a.projectRoot.length)
    .find((record) => {
      const relative = path.relative(record.projectRoot, cwd)
      return (
        relative === '' ||
        (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
      )
    })
  if (!editor) {
    return input.command
  }
  const binary = await resolveA5GameContextBinary(
    getAppEnvironment().isPackaged() ? {} : process.env
  )
  if (!binary) {
    throw new Error('找不到内置 Cocos MCP，请重新安装 cocos-agent。')
  }
  const url = new URL(editor.url)
  const token = url.searchParams.get('token')
  if (!token) {
    throw new Error('编辑器连接信息不完整，请重新打开编辑器。')
  }
  const endpoint = new URL('/editor/binding', url)
  endpoint.searchParams.set('token', token)
  if (input.worktreeId) {
    endpoint.searchParams.set('workspaceId', input.worktreeId)
  }
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) {
    throw new Error('当前编辑器尚不支持 AI 连接，请用新版重新打开项目。')
  }
  const binding = (await response.json()) as {
    instanceId?: string
    viewId?: string
    projectRoot?: string
    error?: string
    capabilities?: string[]
  }
  if (
    binding.error ||
    !binding.instanceId ||
    !binding.viewId ||
    binding.projectRoot !== editor.projectRoot ||
    !binding.capabilities?.includes('editor-context-v1')
  ) {
    throw new Error(
      `无法绑定当前编辑器页面：${binding.error ?? '版本不匹配'}。请保留一个当前项目编辑器页面后重试。`
    )
  }
  const root = path.join(getAppEnvironment().getPath('userData'), 'cocos-editor-sessions')
  await mkdir(root, { recursive: true, mode: 0o700 })
  const directory = await mkdtemp(path.join(root, 'session-'))
  const bindingPath = path.join(directory, 'binding.json')
  await writeFile(bindingPath, JSON.stringify({ ...binding, url: `${url.origin}/`, token }), {
    mode: 0o600
  })
  const server = {
    command: binary,
    args: ['mcp', '--tool-profile', 'editor'],
    env: { A5_EDITOR_BINDING: bindingPath }
  }
  let args: string[]
  if (input.agent === 'claude') {
    const configPath = path.join(directory, 'mcp.json')
    await writeFile(configPath, JSON.stringify({ mcpServers: { 'cocos-editor': server } }), {
      mode: 0o600
    })
    // The separate variadic option would consume a following positional prompt.
    args = [`--mcp-config=${configPath}`]
  } else {
    const config = `mcp_servers.cocos-editor={command=${JSON.stringify(binary)},args=${JSON.stringify(server.args)},env={A5_EDITOR_BINDING=${JSON.stringify(bindingPath)}}}`
    args = ['-c', config]
  }
  const command = insertAgentStartupArgs(input.command, input.agent, args, input.shell)
  if (!command) {
    throw new Error(
      '当前 Agent 启动命令无法安全附加编辑器配置，请使用直接的 Claude 或 Codex 命令。'
    )
  }
  return command
}
