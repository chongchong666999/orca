import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { configureGoldenStubAgent, getGoldenStubAgentLaunchEnv } from './helpers/golden-stub-agent'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { expect, test } from './helpers/orca-app'
import { readTerminalAccessibilityText } from './helpers/terminal-accessibility-tree'
import type { Page, ElectronApplication } from '@stablyai/playwright-test'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'

async function sidebarText(page: Page): Promise<string | null> {
  const tabId = await page
    .locator('[data-sidebar-terminal-panel] [data-terminal-layout-leaf-ids]:visible')
    .getAttribute('data-terminal-tab-id')
  return tabId ? readTerminalAccessibilityText(page, tabId) : null
}

test.use({
  launchEnv: getGoldenStubAgentLaunchEnv(),
  orcaAppExtraEnv: { ORCA_BACKGROUND_LAUNCH: '1' }
})

test('sidebar shell and agent stay interactive alongside the browser', async ({
  orcaPage: page,
  electronApp,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const folderPath = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-sidebar-folder-')))
  registerPostElectronShutdownCleanup(async () =>
    rmSync(folderPath, { recursive: true, force: true })
  )
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await page.evaluate(async () => {
    await window.__store!.getState().updateSettings({ uiLanguage: 'en' })
  })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 900)
  )
  await configureGoldenStubAgent(page, { agent: 'codex' })
  const panel = page.locator('[data-sidebar-terminal-panel]')
  await expect(panel).toBeVisible()
  const originalWorktreeId = await page.evaluate(() => window.__store!.getState().activeWorktreeId!)
  const browserId = await page.evaluate(() => {
    const state = window.__store!.getState()
    state.setRightSidebarWidth(440)
    return state.createBrowserTab(state.activeWorktreeId!, 'about:blank', { activate: true }).id
  })
  const centralTerminals = page.locator('[data-testid="sortable-tab"]:visible')
  await expect(centralTerminals).toHaveCount(1)
  await panel.getByRole('button', { name: 'New session', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New Terminal', exact: true }).click()
  const input = panel.locator('.xterm-helper-textarea:visible')
  await expect(input).toBeAttached({ timeout: 30000 })
  await input.focus()
  await page.keyboard.type(
    process.platform === 'win32'
      ? "Write-Output ('SIDEBAR_' + 'SHELL_OK')"
      : "printf 'SIDEBAR_%s\\n' 'SHELL_OK'"
  )
  await page.keyboard.press('Enter')
  await expect.poll(() => sidebarText(page)).toContain('SIDEBAR_SHELL_OK')
  await expect.soft(centralTerminals).toHaveCount(1)
  expect(await page.evaluate(() => window.__store!.getState().activeBrowserTabId)).toBe(browserId)
  expect(await page.evaluate(() => window.__store!.getState().activeTabType)).toBe('browser')
  const shellId = await panel.getByRole('tab', { selected: true }).innerText()
  await panel.getByRole('button', { name: 'New session', exact: true }).click()
  await page
    .getByRole('menuitem', { name: /^Codex(?:\s|$)/i })
    .first()
    .click()
  await expect
    .poll(() => sidebarText(page), { timeout: 30000 })
    .toContain('GOLDEN_STUB_AGENT_READY')
  await expect.soft(centralTerminals).toHaveCount(1)
  expect(await page.evaluate(() => window.__store!.getState().activeBrowserTabId)).toBe(browserId)
  expect(await page.evaluate(() => window.__store!.getState().activeTabType)).toBe('browser')
  await page.getByRole('button', { name: 'Agents', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Search sessions', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect.poll(() => sidebarText(page)).toContain('GOLDEN_STUB_AGENT_READY')
  await panel.getByRole('tab', { name: shellId, exact: true }).click()
  await expect.poll(() => sidebarText(page)).toContain('SIDEBAR_SHELL_OK')
  await page.evaluate(() => window.__store!.getState().setRightSidebarOpen(false))
  await expect(panel).toHaveCount(0)
  await page.evaluate(() => window.__store!.getState().setRightSidebarOpen(true))
  await expect.poll(() => sidebarText(page)).toContain('SIDEBAR_SHELL_OK')
  await input.focus()
  await page.keyboard.type(
    process.platform === 'win32'
      ? "Write-Output ('SIDEBAR_' + 'RECONNECTED')"
      : "printf 'SIDEBAR_%s\\n' 'RECONNECTED'"
  )
  await page.keyboard.press('Enter')
  await expect.poll(() => sidebarText(page)).toContain('SIDEBAR_RECONNECTED')
  await page.evaluate(async (folderPath) => {
    const store = window.__store!
    const group = await window.api.projectGroups.create({
      name: 'Sidebar folder test',
      parentPath: folderPath,
      createdFrom: 'folder-scan'
    })
    await store.getState().fetchProjectGroups({ runtimeEnvironmentId: null, throwOnError: true })
    const folder = await store
      .getState()
      .createFolderWorkspace(
        { projectGroupId: group.id, name: 'Sidebar folder', folderPath },
        { runtimeEnvironmentId: null }
      )
    if (!folder) {
      throw new Error('Could not create folder workspace')
    }
    store.getState().setActiveFolderWorkspace(folder.id)
    store.getState().setRightSidebarTab('terminal')
  }, folderPath)
  await panel.getByRole('button', { name: 'New session', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New Terminal', exact: true }).click()
  await expect(input).toBeAttached({ timeout: 30000 })
  await input.focus()
  await page.keyboard.type('pwd')
  await page.keyboard.press('Enter')
  await expect.poll(() => sidebarText(page)).toContain(path.basename(folderPath))
  expect(await sidebarText(page)).not.toContain('SIDEBAR_SHELL_OK')
  await page.evaluate((id) => window.__store!.getState().setActiveWorktree(id), originalWorktreeId)
  await expect.poll(() => sidebarText(page)).toContain('SIDEBAR_RECONNECTED')
  await page.evaluate(() => window.__store!.getState().setRightSidebarWidth(520))
  await expect.poll(() => sidebarText(page)).toContain('SIDEBAR_RECONNECTED')
  await page.screenshot({ path: testInfo.outputPath('sidebar-terminal.png') })
  await panel.getByRole('button', { name: `Close ${shellId}`, exact: true }).click()
  await expect(panel.getByRole('tab', { name: shellId, exact: true })).toHaveCount(0)
  await expect.poll(() => sidebarText(page)).toContain('GOLDEN_STUB_AGENT_READY')
  expect(await page.evaluate(() => window.__store!.getState().activeBrowserTabId)).toBe(browserId)
  await panel.getByRole('button', { name: 'New session', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Terminal 1', exact: true }).click()
  await expect(
    panel.getByRole('tab', { name: 'Terminal 1', selected: true, exact: true })
  ).toBeVisible()
  await expect(centralTerminals).toHaveCount(0)
  await input.focus()
  await page.keyboard.type(
    process.platform === 'win32'
      ? "Write-Output ('SIDEBAR_' + 'MOVED')"
      : "printf 'SIDEBAR_%s\\n' 'MOVED'"
  )
  await page.keyboard.press('Enter')
  await expect.poll(() => sidebarText(page)).toContain('SIDEBAR_MOVED')
  expect(await page.evaluate(() => window.__store!.getState().activeBrowserTabId)).toBe(browserId)
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w.isVisible())
    )
  ).toBe(false)
})

test('sidebar terminal restores beside the browser after relaunch', async ({
  testRepoPath
}, testInfo) => {
  const session = createRestartSession(testInfo, { ORCA_BACKGROUND_LAUNCH: '1' })
  let app: ElectronApplication | undefined
  try {
    const first = await session.launch()
    app = first.app
    await waitForSessionReady(first.page)
    await attachRepoAndOpenTerminal(first.page, testRepoPath)
    const browserId = await first.page.evaluate(async () => {
      const state = window.__store!.getState()
      await state.updateSettings({ uiLanguage: 'en' })
      const browser = state.createBrowserTab(state.activeWorktreeId!, 'about:blank', {
        activate: true
      })
      for (const tab of state.tabsByWorktree[state.activeWorktreeId!] ?? []) {
        state.closeTab(tab.id)
      }
      state.setRightSidebarOpen(true)
      state.setRightSidebarTab('terminal')
      return browser.id
    })
    const panel = first.page.locator('[data-sidebar-terminal-panel]')
    await panel.getByRole('button', { name: 'New session', exact: true }).click()
    await first.page.getByRole('menuitem', { name: 'New Terminal', exact: true }).click()
    await panel.locator('.xterm-helper-textarea:visible').focus()
    await first.page.keyboard.type(
      process.platform === 'win32'
        ? "Write-Output ('SIDEBAR_' + 'BEFORE_RESTART')"
        : "printf 'SIDEBAR_%s\\n' 'BEFORE_RESTART'"
    )
    await first.page.keyboard.press('Enter')
    await expect.poll(() => sidebarText(first.page)).toContain('SIDEBAR_BEFORE_RESTART')
    const title = await panel.getByRole('tab', { selected: true }).innerText()
    await session.close(app)
    app = undefined

    const second = await session.launch()
    app = second.app
    await waitForSessionReady(second.page)
    const restored = second.page.locator('[data-sidebar-terminal-panel]')
    await expect(
      restored.getByRole('tab', { name: title, selected: true, exact: true })
    ).toBeVisible()
    await expect(second.page.locator('[data-testid="sortable-tab"]:visible')).toHaveCount(0)
    await expect(second.page.locator(`[data-tab-id="${browserId}"]`)).toBeVisible()
    await expect
      .poll(() => sidebarText(second.page), { timeout: 30000 })
      .toContain('SIDEBAR_BEFORE_RESTART')
    await restored.locator('.xterm-helper-textarea:visible').focus()
    await second.page.keyboard.type(
      process.platform === 'win32'
        ? "Write-Output ('SIDEBAR_' + 'AFTER_RESTART')"
        : "printf 'SIDEBAR_%s\\n' 'AFTER_RESTART'"
    )
    await second.page.keyboard.press('Enter')
    await expect.poll(() => sidebarText(second.page)).toContain('SIDEBAR_AFTER_RESTART')
    expect(await second.page.evaluate(() => window.__store!.getState().activeTabType)).toBe(
      'browser'
    )
  } finally {
    await session.dispose(app)
  }
})
