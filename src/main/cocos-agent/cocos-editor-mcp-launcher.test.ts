import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { runProcess } from '@orca/process-host'

const environment = vi.hoisted(() => ({ directory: '' }))
vi.mock('../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ isPackaged: () => true, getPath: () => environment.directory })
}))
afterEach(async () => {
  if (environment.directory) {
    await rm(environment.directory, { recursive: true, force: true })
  }
})

it.skipIf(process.platform === 'win32')(
  'retains the configured launcher path across app restarts and safely executes the updated absolute bundle path',
  async () => {
    environment.directory = await mkdtemp(path.join(os.tmpdir(), 'cocos-launcher-'))
    const oldFolder = path.join(environment.directory, "Old app $notExpanded 'quoted'")
    const newFolder = path.join(environment.directory, 'New app')
    await mkdir(oldFolder)
    await mkdir(newFolder)
    const oldBinary = path.join(oldFolder, 'a5-game-context')
    const newBinary = path.join(newFolder, 'a5-game-context')
    await writeFile(oldBinary, '#!/bin/sh\nprintf "%s\\n" "old-bundle" "$@"\n', { mode: 0o700 })
    await writeFile(newBinary, '#!/bin/sh\nprintf "%s\\n" "new-bundle" "$@"\n', { mode: 0o700 })
    const first = await import('./cocos-editor-mcp-launcher')
    const launcher = await first.refreshCocosEditorMcpLauncher(oldBinary)
    expect(
      (
        await runProcess({
          program: launcher!,
          args: ['mcp', '--tool-profile', 'editor'],
          timeoutMs: 3000
        })
      ).stdout
    ).toBe('old-bundle\nmcp\n--tool-profile\neditor\n')
    vi.resetModules()
    const next = await import('./cocos-editor-mcp-launcher')
    expect(await next.refreshCocosEditorMcpLauncher(newBinary)).toBe(launcher)
    expect(
      (
        await runProcess({
          program: launcher!,
          args: ['mcp', '--tool-profile', 'editor'],
          timeoutMs: 3000
        })
      ).stdout
    ).toBe('new-bundle\nmcp\n--tool-profile\neditor\n')
  }
)
