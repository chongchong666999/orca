import type { A5ToolchainFailureCode } from '../../shared/cocos-agent/a5-game-context-toolchain-types'

const MAX_DETAIL_LENGTH = 300

/** npm's own reason line (`npm error …` / `npm ERR! …`), else the last line it printed. */
function npmReason(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const reasons = lines
    .filter((line) => /^npm (?:error|ERR!)\s/.test(line))
    .map((line) => line.replace(/^npm (?:error|ERR!)\s+/, ''))
    .filter((line) => !/^(?:A complete log|Log files were not written|code\s)/i.test(line))
  return (reasons.at(0) ?? lines.at(-1) ?? '').slice(0, MAX_DETAIL_LENGTH)
}

/** Why `npm install -g` failed, in the terms the settings panel explains; the full output goes to the log. */
export function classifyNpmInstallFailure(
  platform: NodeJS.Platform,
  output: string,
  timedOut: boolean
): { code: A5ToolchainFailureCode; detail: string } {
  const detail = npmReason(output)
  if (timedOut) {
    return { code: 'timed-out', detail }
  }
  if (/\bENOSPC\b/.test(output)) {
    return { code: 'no-space', detail }
  }
  // Why: on Windows a file a running a5-game-context holds open fails its replacement with EBUSY or EPERM.
  if (/\bEBUSY\b/.test(output) || (platform === 'win32' && /\bEPERM\b/.test(output))) {
    return { code: 'busy', detail }
  }
  if (/\b(?:EACCES|EPERM)\b/.test(output)) {
    return { code: 'permission', detail }
  }
  return { code: 'unknown', detail }
}
