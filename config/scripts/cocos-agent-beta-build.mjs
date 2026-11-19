import { readFileSync } from 'node:fs'
import path from 'node:path'

const VERSION_FILE = 'src/shared/cocos-agent/cocos-agent-version.ts'

/** The release number `COCOS_AGENT_VERSION` declares in `source` (cocos-agent-version.ts). */
export function readCocosAgentVersion(source) {
  const version = /export const COCOS_AGENT_VERSION = '(\d+\.\d+\.\d+)'/.exec(source)?.[1]
  if (!version) {
    throw new Error(`${VERSION_FILE} declares no COCOS_AGENT_VERSION`)
  }
  return version
}

/** cocos-agent's own release number, read from the checkout at `root`. */
export function cocosAgentVersion(root = process.cwd()) {
  return readCocosAgentVersion(readFileSync(path.join(root, VERSION_FILE), 'utf8'))
}

/**
 * A beta package's name after `cocos-agent-beta-`: cocos-agent's version, the local date and time it was built and its
 * commit (`0.1.1-20261119-0905-dfca0ec26289`). The app's internal version stays Orca's (cocos-agent-version.ts); only
 * the dmg and zip carry this. A release build would need the version alone.
 */
export function createCocosAgentBetaBuild(version, date, commit) {
  const sanitizedCommit = commit.replace(/[^0-9A-Za-z-]/g, '').slice(0, 12)
  if (!sanitizedCommit) {
    throw new Error('Git commit identity is empty.')
  }
  const two = (value) => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}`
  return `${version}-${day}-${two(date.getHours())}${two(date.getMinutes())}-${sanitizedCommit}`
}
