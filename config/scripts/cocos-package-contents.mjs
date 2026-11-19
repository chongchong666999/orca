import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { getRawHeader, extractFile } = require('@electron/asar')

export function assertCocosPackageContents(archive) {
  if (
    !extractFile(archive, 'out/renderer/index.html')
      .toString()
      .includes('<title>Cocos Agent</title>')
  ) {
    throw new Error('The Cocos desktop brand is missing from the packaged renderer.')
  }
  const { files } = getRawHeader(archive).header
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
