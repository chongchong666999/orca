import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import {
  EMPTY_SIDEBAR_TERMINAL_RECORD,
  normalizeSidebarTerminalRecord,
  type SidebarTerminalRecord
} from '../../shared/cocos-agent/sidebar-terminal-record'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { mainProcessState } from '../startup/main-process-state'

const COCOS_AGENT_SIDEBAR_TAB = 'terminal'
const COCOS_AGENT_SIDEBAR_WIDTH = 420

function recordPath(): string {
  return path.join(getAppEnvironment().getPath('userData'), 'cocos-agent', 'sidebar-terminals.json')
}

function save(record: SidebarTerminalRecord): void {
  const file = recordPath()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileAtomically(file, JSON.stringify(record), { mode: 0o600 })
}

/** The renderer's sidebar assignments; the first read of an install also turns on cocos-agent's sidebar defaults. */
export async function readSidebarTerminalRecord(): Promise<SidebarTerminalRecord> {
  let record = EMPTY_SIDEBAR_TERMINAL_RECORD
  try {
    record = normalizeSidebarTerminalRecord(JSON.parse(await readFile(recordPath(), 'utf8')))
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
    if (!missing) {
      console.warn('[cocos-agent] sidebar terminal record unreadable; starting empty', error)
    }
  }
  if (!record.uiDefaultsApplied) {
    // Why: upstream's getDefaultUIState stays untouched; cocos-agent applies its own defaults once per install.
    mainProcessState.store?.updateUI({
      rightSidebarTab: COCOS_AGENT_SIDEBAR_TAB,
      rightSidebarWidth: COCOS_AGENT_SIDEBAR_WIDTH
    })
    record = { ...record, uiDefaultsApplied: true }
    save(record)
  }
  return record
}

export function writeSidebarTerminalRecord(value: unknown): void {
  save({ ...normalizeSidebarTerminalRecord(value), uiDefaultsApplied: true })
}
