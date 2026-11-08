import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { getRawHeader } = require('@electron/asar')

export function assertCocosPackageContents(archive) {
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
