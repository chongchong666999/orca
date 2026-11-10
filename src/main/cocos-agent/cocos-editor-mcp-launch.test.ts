import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getAppEnvironment } from '../../shared/app-environment'
import { tokenizeStartupCommand } from '../../shared/agent-launch/startup/tui-agent-startup-shell'
import { cocosEditorService } from './cocos-editor-service-instance'
import { refreshCocosEditorBindings } from './cocos-editor-mcp-bindings'
import { prepareCocosEditorMcpLaunch } from './cocos-editor-mcp-launch'

let directory: string
let editorProjectRoot: string
let binary: string
let server: Server
let origin: string
let instanceId: string
let viewId: string
let viewError: string | undefined
let multiplePages: boolean

beforeEach(async () => {
  directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'cocos-mcp launch-')))
  editorProjectRoot = directory
  binary = path.join(directory, 'bundled-a5-game-context')
  await writeFile(binary, '', { mode: 0o755 })
  vi.stubEnv('A5_GAME_CONTEXT_BIN', binary)
  vi.spyOn(getAppEnvironment(), 'isPackaged').mockReturnValue(false)
  vi.spyOn(getAppEnvironment(), 'getPath').mockReturnValue(directory)
  viewError = undefined
  multiplePages = false
  instanceId = 'visible-instance'
  viewId = 'visible-page'
  server = createServer((request, response) => {
    const url = new URL(request.url!, origin)
    response.setHeader('content-type', 'application/json')
    response.end(
      JSON.stringify({
        instanceId,
        viewId,
        projectRoot: editorProjectRoot,
        capabilities: ['editor-context-v1'],
        error:
          viewError ??
          (multiplePages && url.searchParams.get('viewId') !== 'visible-page'
            ? 'AMBIGUOUS_EDITOR_VIEW'
            : undefined) ??
          (url.searchParams.get('workspaceId') !== 'folder-workspace' ||
          url.searchParams.get('token') !== 'test-token'
            ? 'WRONG_BINDING'
            : undefined)
      })
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('No test editor address')
  }
  origin = `http://127.0.0.1:${address.port}`
  vi.spyOn(cocosEditorService, 'list').mockReturnValue([
    { projectRoot: directory, url: `${origin}/?token=test-token`, startedByApp: true }
  ])
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
  await rm(directory, { recursive: true, force: true })
})

it('binds an agent at the repository root to its nested Cocos editor', async () => {
  editorProjectRoot = path.join(directory, 'wpk')
  await mkdir(path.join(editorProjectRoot, 'assets'), { recursive: true })
  await writeFile(path.join(editorProjectRoot, 'project.json'), '{"version":"2.4.13"}')
  vi.mocked(cocosEditorService.list).mockReturnValue([
    { projectRoot: editorProjectRoot, url: `${origin}/?token=test-token`, startedByApp: true }
  ])

  const command = await prepareCocosEditorMcpLaunch({
    command: 'claude',
    agent: 'claude',
    cwd: directory,
    worktreeId: 'folder-workspace',
    local: true,
    shell: 'posix'
  })
  const parsed = tokenizeStartupCommand(command!, 'posix')
  if (!parsed.ok || !parsed.tokens[1]?.startsWith('--mcp-config=')) {
    throw new Error('Missing nested editor binding')
  }
  const config = JSON.parse(await readFile(parsed.tokens[1].slice('--mcp-config='.length), 'utf8'))
  const binding = JSON.parse(
    await readFile(config.mcpServers['cocos-editor'].env.A5_EDITOR_BINDING, 'utf8')
  )
  expect(binding).toMatchObject({
    projectRoot: editorProjectRoot,
    workspaceId: 'folder-workspace',
    viewId: 'visible-page'
  })
})

it.each(['claude', 'codex'])(
  'pins %s to the current page without changing user MCP settings',
  async (agent) => {
    const command = await prepareCocosEditorMcpLaunch({
      command: `${agent} --resume saved-session`,
      agent,
      cwd: directory,
      worktreeId: 'folder-workspace',
      local: true,
      shell: 'posix'
    })
    const parsed = tokenizeStartupCommand(command!, 'posix')
    if (!parsed.ok) {
      throw new Error('Invalid launch command')
    }
    expect(parsed.tokens.slice(-2)).toEqual(['--resume', 'saved-session'])
    let bindingPath: string
    if (agent === 'claude') {
      expect(parsed.tokens[1]).toMatch(/^--mcp-config=/)
      const config = JSON.parse(
        await readFile(parsed.tokens[1].slice('--mcp-config='.length), 'utf8')
      )
      expect(Object.keys(config.mcpServers)).toEqual(['cocos-editor'])
      expect(config.mcpServers['cocos-editor'].command).toBe(binary)
      expect(config.mcpServers['cocos-editor'].args).toEqual(['mcp', '--tool-profile', 'editor'])
      bindingPath = config.mcpServers['cocos-editor'].env.A5_EDITOR_BINDING
    } else {
      expect(parsed.tokens[1]).toBe('-c')
      expect(parsed.tokens[2]).toContain(
        `mcp_servers.cocos-editor={command=${JSON.stringify(binary)},args=["mcp","--tool-profile","editor"]`
      )
      const match = parsed.tokens[2].match(/A5_EDITOR_BINDING=("(?:[^"\\]|\\.)*")/)
      expect(match).not.toBeNull()
      bindingPath = JSON.parse(match![1])
    }
    const binding = JSON.parse(await readFile(bindingPath, 'utf8'))
    expect(binding).toMatchObject({
      instanceId: 'visible-instance',
      viewId: 'visible-page',
      projectRoot: directory,
      url: `${origin}/`,
      token: 'test-token'
    })
    expect(command).not.toContain('test-token')
    instanceId = 'resumed-instance'
    multiplePages = true
    await refreshCocosEditorBindings(
      { projectRoot: directory, url: `${origin}/?token=test-token`, startedByApp: true },
      'folder-workspace',
      'visible-page',
      () => true
    )
    expect(JSON.parse(await readFile(bindingPath, 'utf8'))).toMatchObject({
      instanceId: 'resumed-instance',
      viewId: 'visible-page'
    })
    viewId = 'another-page'
    await expect(
      refreshCocosEditorBindings(
        { projectRoot: directory, url: `${origin}/?token=test-token`, startedByApp: true },
        'folder-workspace',
        'visible-page',
        () => true
      )
    ).rejects.toThrow('页面已改变')
    expect(JSON.parse(await readFile(bindingPath, 'utf8'))).toMatchObject({
      instanceId: 'resumed-instance',
      viewId: 'visible-page'
    })
  }
)

it('refuses ambiguous editor pages instead of launching an unbound local agent', async () => {
  multiplePages = true
  await expect(
    prepareCocosEditorMcpLaunch({
      command: 'claude',
      agent: 'claude',
      cwd: directory,
      worktreeId: 'folder-workspace',
      local: true,
      shell: 'posix'
    })
  ).rejects.toThrow('AMBIGUOUS_EDITOR_VIEW')
})

it('keeps remote launches free of local editor bindings', async () => {
  expect(
    await prepareCocosEditorMcpLaunch({
      command: 'codex resume remote-session',
      agent: 'codex',
      cwd: directory,
      worktreeId: 'folder-workspace',
      local: false,
      shell: 'posix'
    })
  ).toBe('codex resume remote-session')
})
