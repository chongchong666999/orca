import { startBrowserSplitPageServer } from './helpers/browser-split-page-server'
import { expect, test } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('the Cocos editor stays flush with the left sidebar as it narrows', async ({
  orcaPage: page,
  electronApp
}) => {
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 900)
  )
  const server = await startBrowserSplitPageServer()
  try {
    const url = new URL('/?cocos-agent=editor&token=fixture', server.pageUrl('editor', 1))
    const editorId = await page.evaluate(
      async ({ worktreeId, url }) => {
        const state = window.__store!.getState()
        await state.updateSettings({ uiLanguage: 'en', showTitlebarAppName: true })
        state.setSidebarOpen(true)
        state.setSidebarWidth(380)
        state.setRightSidebarOpen(true)
        state.setRightSidebarWidth(440)
        return state.createBrowserTab(worktreeId, url, { activate: true }).id
      },
      { worktreeId, url: url.href }
    )
    const editor = page.locator(`[data-browser-overlay-tab-id="${editorId}"] webview:visible`)
    const handle = page.locator('[data-sidebar-resize-handle]')
    await expect(editor).toBeVisible()
    const expectAligned = async (width: number) => {
      await expect
        .poll(() =>
          handle.evaluate((node) => node.previousElementSibling!.getBoundingClientRect().right)
        )
        .toBeCloseTo(width, 0)
      await expect
        .poll(async () => Math.abs(Math.round((await editor.boundingBox())!.x) - width), {
          timeout: 3000
        })
        .toBeLessThanOrEqual(1)
    }
    await expectAligned(380)

    const handleBox = (await handle.boundingBox())!
    const x = handleBox.x + 1
    const y = handleBox.y + handleBox.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    try {
      await page.mouse.move(x - 160, y, { steps: 8 })
      await expectAligned(220)
    } finally {
      await page.mouse.up()
    }
    await expectAligned(220)

    const toggle = page.getByRole('button', { name: 'Toggle sidebar', exact: true })
    const back = page.getByRole('button', { name: 'Go back', exact: true })
    const forward = page.getByRole('button', { name: 'Go forward', exact: true })
    const expectControlsAligned = async () => {
      const toggleBox = (await toggle.boundingBox())!
      const backBox = (await back.boundingBox())!
      const forwardBox = (await forward.boundingBox())!
      expect(Math.round(toggleBox.x + toggleBox.width)).toBeLessThanOrEqual(Math.round(backBox.x))
      expect(Math.round(forwardBox.x + forwardBox.width)).toBeLessThanOrEqual(220)
    }
    await expectControlsAligned()

    await toggle.focus()
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      for (let step = 0; step < 6; step += 1) {
        win.webContents.send('terminal:zoom', 'out')
      }
    })
    await expect.poll(() => page.evaluate(() => window.api.ui.getZoomLevel())).toBe(-3)
    await expectAligned(220)
    await expectControlsAligned()
  } finally {
    await server.close()
  }
})
