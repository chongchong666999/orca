import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import product from '../cocos-agent/desktop-product.json' with { type: 'json' }
const require = createRequire(import.meta.url)
const { getRawHeader, extractFile } = require('@electron/asar')

export function assertCocosPackageContents(archive) {
  if (
    // asar splits lookups on path.sep, so a forward-slash path is not found on Windows.
    !extractFile(archive, path.join('out', 'renderer', 'index.html'))
      .toString()
      .includes(`<title>${product.name}</title>`)
  ) {
    throw new Error('The Cocos desktop brand is missing from the packaged renderer.')
  }
  const { files } = getRawHeader(archive).header
  const chunks = files.out?.files?.main?.files?.chunks?.files ?? {}
  const dockIcon = readFileSync(new URL('../cocos-agent/app-icon.png', import.meta.url))
  const hasCocosIcon = Object.keys(chunks).some(
    (file) =>
      /^app-icon-.*\.png$/.test(file) &&
      extractFile(archive, path.join('out', 'main', 'chunks', file)).equals(dockIcon)
  )
  if (!hasCocosIcon) {
    throw new Error('The Cocos Dock/window icon is missing from the packaged main process.')
  }
  for (const name of [
    '.mcp.json',
    '.context-engine',
    '.cache',
    '.tmp',
    '.anti-slop-plugin',
    'test-results',
    'playwright-report'
  ]) {
    if (files[name]) {
      throw new Error(`Development data entered the application archive: ${name}`)
    }
  }
}
