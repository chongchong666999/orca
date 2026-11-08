import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcess } from '@orca/process-host'
import os from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'

const environment = vi.hoisted(() => ({ directory: '' }))
vi.mock('../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => environment.directory })
}))
afterEach(async () => {
  vi.unstubAllGlobals()
  if (environment.directory) {
    await rm(environment.directory, { recursive: true, force: true })
  }
})

it('rediscovers a retained terminal binding after the app module restarts and refreshes the same owned page', async () => {
  environment.directory = await mkdtemp(path.join(os.tmpdir(), 'cocos-binding-restart-'))
  const session = path.join(environment.directory, 'cocos-editor-sessions', 'session-one')
  await mkdir(session, { recursive: true })
  const file = path.join(session, 'binding.json')
  const oldBinding = {
    projectRoot: '/projects/game',
    viewId: 'same-page',
    instanceId: 'old-instance',
    url: 'http://127.0.0.1:40001/',
    token: 'fixture-old',
    capabilities: ['editor-context-v1']
  }
  await writeFile(file, JSON.stringify(oldBinding))
  const firstApp = await import('./cocos-editor-mcp-bindings')
  firstApp.registerCocosEditorBinding(file, oldBinding, 'workspace-one')
  vi.resetModules()
  const restartedApp = await import('./cocos-editor-mcp-bindings')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ...oldBinding, instanceId: 'new-instance' }))
  )
  await restartedApp.refreshCocosEditorBindings(
    {
      projectRoot: '/projects/game',
      url: 'http://127.0.0.1:40002/?token=fixture-new',
      startedByApp: true
    },
    'workspace-one',
    'same-page',
    () => true
  )
  expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
    instanceId: 'new-instance',
    url: 'http://127.0.0.1:40002/',
    viewId: 'same-page'
  })
})

it('updates only the persisted project, workspace and view owner after a restart', async () => {
  environment.directory = await mkdtemp(path.join(os.tmpdir(), 'cocos-binding-owners-'))
  const root = path.join(environment.directory, 'cocos-editor-sessions')
  const base = {
    projectRoot: '/projects/game',
    workspaceId: 'workspace-one',
    viewId: 'same-page',
    instanceId: 'old-instance',
    url: 'http://127.0.0.1:40001/',
    token: 'fixture-old',
    capabilities: ['editor-context-v1']
  }
  const records = [
    base,
    { ...base, projectRoot: '/projects/other' },
    { ...base, workspaceId: 'workspace-two' },
    { ...base, viewId: 'other-page' },
    { ...base, workspaceId: undefined }
  ]
  const files: string[] = []
  for (const [index, record] of records.entries()) {
    const directory = path.join(root, `session-${index}`)
    await mkdir(directory, { recursive: true })
    const file = path.join(directory, 'binding.json')
    await writeFile(file, JSON.stringify(record))
    files.push(file)
  }
  vi.resetModules()
  const restarted = await import('./cocos-editor-mcp-bindings')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ...base, instanceId: 'new-instance', viewId: 'wrong-page' }))
  )
  const editor = {
    projectRoot: '/projects/game',
    url: 'http://127.0.0.1:40002/?token=fixture-new',
    startedByApp: true
  }
  await expect(
    restarted.refreshCocosEditorBindings(editor, 'workspace-one', 'same-page', () => true)
  ).rejects.toThrow('页面已改变')
  expect(JSON.parse(await readFile(files[0], 'utf8')).instanceId).toBe('old-instance')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ...base, instanceId: 'new-instance' }))
  )
  await restarted.refreshCocosEditorBindings(editor, 'workspace-one', 'same-page', () => true)
  expect(JSON.parse(await readFile(files[0], 'utf8'))).toMatchObject({
    workspaceId: 'workspace-one',
    viewId: 'same-page',
    instanceId: 'new-instance'
  })
  for (const file of files.slice(1)) {
    expect(JSON.parse(await readFile(file, 'utf8')).instanceId).toBe('old-instance')
  }
  vi.resetModules()
  const again = await import('./cocos-editor-mcp-bindings')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ...base, instanceId: 'third-instance' }))
  )
  await again.refreshCocosEditorBindings(editor, 'workspace-one', 'same-page', () => true)
  expect(JSON.parse(await readFile(files[0], 'utf8')).instanceId).toBe('third-instance')
})

it('preserves legacy unowned bindings and requests a one-time MCP reconnect instead of assigning another page', async () => {
  environment.directory = await mkdtemp(path.join(os.tmpdir(), 'cocos-binding-legacy-'))
  const directory = path.join(environment.directory, 'cocos-editor-sessions', 'session-legacy')
  await mkdir(directory, { recursive: true })
  const file = path.join(directory, 'binding.json')
  const contents = JSON.stringify({
    projectRoot: '/projects/game',
    viewId: 'old-random-page',
    instanceId: 'old-instance'
  })
  await writeFile(file, contents)
  vi.resetModules()
  const restarted = await import('./cocos-editor-mcp-bindings')
  await expect(
    restarted.refreshCocosEditorBindings(
      {
        projectRoot: '/projects/game',
        url: 'http://127.0.0.1:40002/?token=fixture-new',
        startedByApp: true
      },
      'workspace-one',
      'new-random-page',
      () => true
    )
  ).rejects.toThrow('缺少工作区归属信息')
  await expect(
    restarted.refreshCocosEditorBindings(
      {
        projectRoot: '/projects/game',
        url: 'http://127.0.0.1:40002/?token=fixture-new',
        startedByApp: true
      },
      'workspace-one',
      'new-random-page',
      () => true
    )
  ).resolves.toBeUndefined()
  expect(await readFile(file, 'utf8')).toBe(contents)
  vi.resetModules()
  const nextApp = await import('./cocos-editor-mcp-bindings')
  await expect(
    nextApp.refreshCocosEditorBindings(
      {
        projectRoot: '/projects/game',
        url: 'http://127.0.0.1:40002/?token=fixture-new',
        startedByApp: true
      },
      'workspace-one',
      'new-random-page',
      () => true
    )
  ).rejects.toThrow('缺少工作区归属信息')
})

it('refreshes the retained binding in a separate app process with no inherited module registry', async () => {
  environment.directory = await mkdtemp(path.join(os.tmpdir(), 'cocos-binding-process-'))
  const source = path.resolve('src/main/cocos-agent/cocos-editor-mcp-bindings.ts')
  const appEnvironment = path.resolve('src/shared/app-environment.ts')
  const script = path.join(environment.directory, 'restart.ts')
  await writeFile(
    script,
    `
    import { mkdir, readFile, writeFile } from 'node:fs/promises';
    import path from 'node:path';
    import { setAppEnvironment } from ${JSON.stringify(pathToFileURL(appEnvironment).href)};
    import { registerCocosEditorBinding, refreshCocosEditorBindings } from ${JSON.stringify(pathToFileURL(source).href)};
    const directory = process.argv[3];
    setAppEnvironment({ getPath: () => directory, getAppPath: () => directory, getVersion: () => 'fixture',
      isPackaged: () => false, onWillQuit: () => {}, exit: () => {}, getAppMetrics: () => [] });
    const session = path.join(directory, 'cocos-editor-sessions', 'session-process');
    const file = path.join(session, 'binding.json');
    const binding = { projectRoot: '/projects/game', workspaceId: 'workspace-one', viewId: 'same-page',
      instanceId: 'old-instance', url: 'http://127.0.0.1:40001/', token: 'fixture-old', capabilities: ['editor-context-v1'] };
    if (process.argv[2] === 'start') {
      await mkdir(session, { recursive: true });
      await writeFile(file, JSON.stringify(binding));
      registerCocosEditorBinding(file, binding, 'workspace-one');
    } else {
      globalThis.fetch = async () => Response.json({ ...binding, instanceId: 'new-instance' });
      await refreshCocosEditorBindings({ projectRoot: '/projects/game', url: 'http://127.0.0.1:40002/?token=fixture-new', startedByApp: true },
        'workspace-one', 'same-page', () => true);
      const result = JSON.parse(await readFile(file, 'utf8'));
      console.log(JSON.stringify({ instanceId: result.instanceId, workspaceId: result.workspaceId, viewId: result.viewId }));
    }
  `
  )
  const program = path.resolve('node_modules/bun/bin/bun.exe')
  const first = await runProcess({
    program,
    args: [script, 'start', environment.directory],
    timeoutMs: 10000
  })
  expect(first.code, first.stderr).toBe(0)
  const restarted = await runProcess({
    program,
    args: [script, 'resume', environment.directory],
    timeoutMs: 10000
  })
  expect(restarted.code, restarted.stderr).toBe(0)
  expect(JSON.parse(restarted.stdout)).toEqual({
    instanceId: 'new-instance',
    workspaceId: 'workspace-one',
    viewId: 'same-page'
  })
})
