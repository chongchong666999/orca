import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ElectronApplication } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import { waitForSessionReady } from './helpers/store'

const resources = '/Applications/cocos-agent.app/Contents/Resources/a5-game-context'
const bundledEditor = `${resources}/node_modules/@a5labs-prime/a5-game-context-darwin-arm64/native-engine/bin/darwin-arm64/a5-game-context`
const bundledNode = '/Applications/cocos-agent.app/Contents/MacOS/cocos-agent'

test('restores the actual Cocos editor page after the application restarts', async ({
  testRepoPath
}, testInfo) => {
  // Two cold desktop launches and editor startup each have their own readiness deadline.
  test.setTimeout(300_000)
  test.skip(process.platform !== 'darwin', 'This local regression uses the installed macOS editor')
  test.skip(!existsSync(bundledEditor), 'The bundled editor is required for this regression')
  mkdirSync(path.join(testRepoPath, 'assets'), { recursive: true })
  writeFileSync(
    path.join(testRepoPath, 'project.json'),
    JSON.stringify({ version: '2.4.13', name: 'RestartFixture' })
  )
  writeFileSync(path.join(testRepoPath, 'assets', '.gitkeep'), '')
  execFileSync('git', ['add', 'project.json', 'assets/.gitkeep'], { cwd: testRepoPath })
  execFileSync('git', ['commit', '-m', 'Add isolated Cocos fixture'], { cwd: testRepoPath })
  const session = createRestartSession(testInfo, {
    ORCA_BACKGROUND_LAUNCH: '1',
    A5_GAME_CONTEXT_BIN: bundledEditor,
    A5_GAME_CONTEXT_PACKAGE_ROOT: resources,
    A5_NODE_EXE: bundledNode,
    A5_NODE_BINARY: bundledNode
  })
  let app: ElectronApplication | undefined
  const visibleEditor = async (instance: ElectronApplication) =>
    instance.evaluate(async ({ webContents }) => {
      for (const guest of webContents.getAllWebContents()) {
        if (guest.getType() !== 'webview' || !guest.getURL().includes('cocos-agent=editor')) {
          continue
        }
        try {
          const status = await guest.executeJavaScript(
            "({title:document.title, editor:!!document.querySelector('[data-panel=hierarchy]')})"
          )
          if (status.editor) {
            return { title: status.title, url: guest.getURL() }
          }
        } catch {
          /* navigation is still in progress */
        }
      }
      return null
    })
  try {
    const first = await session.launch()
    app = first.app
    await waitForSessionReady(first.page)
    const worktree = await attachRepoAndOpenTerminal(first.page, testRepoPath)
    await first.page.evaluate(
      async ({ worktree, project }) => {
        const opened = await window.cocosAgent!.openEditor({ projectPath: project })
        if (!opened.ok) {
          throw new Error(opened.message)
        }
        const url = new URL(opened.url)
        url.searchParams.set('cocos-agent', 'editor')
        url.searchParams.set('cocos-workspace', worktree)
        url.searchParams.set('cocos-view', 'restart-test-view')
        return window
          .__store!.getState()
          .createBrowserTab(worktree, url.toString(), { activate: true }).id
      },
      { worktree, project: testRepoPath }
    )
    await expect.poll(() => visibleEditor(app!), { timeout: 90_000 }).not.toBeNull()
    const firstPage = await visibleEditor(app)
    await session.close(app)
    app = undefined
    const shutdown = new URL(firstPage!.url)
    shutdown.pathname = '/shutdown'
    await fetch(shutdown, { method: 'POST' }).catch(() => undefined)
    await expect
      .poll(async () => {
        try {
          await fetch(firstPage!.url, { signal: AbortSignal.timeout(1000) })
          return true
        } catch {
          return false
        }
      })
      .toBe(false)
    const second = await session.launch()
    app = second.app
    await waitForSessionReady(second.page)
    await expect.poll(() => visibleEditor(app!), { timeout: 60_000 }).not.toBeNull()
    const restored = await visibleEditor(app)
    expect(restored?.url).toContain('cocos-view=restart-test-view')
    expect(restored?.url).not.toBe(firstPage?.url)
    const cdp = await second.page.context().newCDPSession(second.page)
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(testInfo.outputPath('editor-after-restart.png'), Buffer.from(data, 'base64'))
    await cdp.detach()
  } finally {
    await session.dispose(app)
  }
})
