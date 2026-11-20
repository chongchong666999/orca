import { mkdir, rm, rmdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect } from '@stablyai/playwright-test'
import { test } from './desktop/electron-fixtures/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './desktop/renderer-probes/store'

test('branded desktop keeps the account name and Cocos Creator new-tab action', async ({
  orcaPage: page,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  test.skip(process.env.COCOS_AGENT_DESKTOP !== '1', 'Requires a branded Cocos desktop build')
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await page.evaluate(() => window.__store!.getState().updateSettings({ uiLanguage: 'en' }))
  await expect(page).toHaveTitle('Cocos Agent')

  const newTab = page.getByRole('button', { name: 'New tab', exact: true })
  const creator = page.getByRole('menuitem', { name: 'Cocos Creator', exact: true })
  await newTab.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(creator).toHaveCount(0)
  await page.keyboard.press('Escape')

  const assets = path.join(testRepoPath, 'assets')
  const manifest = path.join(testRepoPath, 'project.json')
  await mkdir(assets)
  registerPostElectronShutdownCleanup(async () => {
    await rm(manifest, { force: true })
    await rmdir(assets)
  })
  await writeFile(manifest, JSON.stringify({ version: '2.4.13' }), { flag: 'wx' })
  await newTab.click()
  await expect(creator).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByText('Cocos Agent Account', { exact: true }).first()).toBeVisible()
  await page.evaluate(() => window.__store!.getState().updateSettings({ uiLanguage: 'zh' }))
  await expect(page.getByText('Cocos Agent 账户', { exact: true }).first()).toBeVisible()
})
