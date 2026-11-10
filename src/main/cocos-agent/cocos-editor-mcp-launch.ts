import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import { insertAgentStartupArgs } from '../../shared/agent-launch/startup/insert-agent-startup-args'
import type { AgentStartupShell } from '../../shared/agent-launch/startup/tui-agent-startup-shell'
import { resolveA5GameContextBinary } from './a5-game-context-binary'
import { readCocosEditorBinding, registerCocosEditorBinding } from './cocos-editor-mcp-bindings'
import { refreshCocosEditorMcpLauncher } from './cocos-editor-mcp-launcher'
import { cocosEditorService } from './cocos-editor-service-instance'
import { findCocosEditorForWorkspace } from './cocos-project-detection'

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
  const editors = cocosEditorService.list()
  const editor =
    (await findCocosEditorForWorkspace(cwd, editors)) ??
    [...editors]
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
  const binding = await readCocosEditorBinding(editor, input.worktreeId)
  const root = path.join(getAppEnvironment().getPath('userData'), 'cocos-editor-sessions')
  await mkdir(root, { recursive: true, mode: 0o700 })
  const directory = await mkdtemp(path.join(root, 'session-'))
  const bindingPath = path.join(directory, 'binding.json')
  await writeFile(bindingPath, JSON.stringify(binding), {
    mode: 0o600
  })
  const launcher = await refreshCocosEditorMcpLauncher(binary)
  if (!launcher) {
    throw new Error('找不到内置 Cocos MCP 启动器。')
  }
  const server = {
    command: launcher,
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
    const config = `mcp_servers.cocos-editor={command=${JSON.stringify(launcher)},args=${JSON.stringify(server.args)},env={A5_EDITOR_BINDING=${JSON.stringify(bindingPath)}}}`
    args = ['-c', config]
  }
  const command = insertAgentStartupArgs(input.command, input.agent, args, input.shell)
  if (!command) {
    throw new Error(
      '当前 Agent 启动命令无法安全附加编辑器配置，请使用直接的 Claude 或 Codex 命令。'
    )
  }
  registerCocosEditorBinding(bindingPath, binding, input.worktreeId)
  return command
}
