import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { getAppEnvironment } from '../../shared/app-lifecycle/app-environment'
import {
  EMPTY_SIDEBAR_TERMINAL_RECORD,
  normalizeSidebarTerminalRecord,
  type SidebarTerminalRecord
} from '../../shared/cocos-agent/sidebar-terminal-record'
import { mainProcessState } from '../startup/main-process-state'
import { withSidecarSnapshotQueue } from '../filesystem/sidecar-snapshot-file'
import { publishCocosAgentFile } from './cocos-agent-file-publication'
import { isCocosAgentPackage } from './cocos-agent-package'

const COCOS_AGENT_SIDEBAR_TAB = 'terminal'
const COCOS_AGENT_SIDEBAR_WIDTH = 420

function recordPath(): string {
  return path.join(getAppEnvironment().getPath('userData'), 'cocos-agent', 'sidebar-terminals.json')
}

async function save(file: string, record: SidebarTerminalRecord): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await publishCocosAgentFile(file, JSON.stringify(record), 0o600)
}

/** The renderer's sidebar assignments; the first read of an install also turns on cocos-agent's sidebar defaults. */
export async function readSidebarTerminalRecord(): Promise<SidebarTerminalRecord> {
  const file = recordPath()
  return withSidecarSnapshotQueue(file, async () => {
    let record = EMPTY_SIDEBAR_TERMINAL_RECORD
    try {
      record = normalizeSidebarTerminalRecord(JSON.parse(await readFile(file, 'utf8')))
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) {
        console.warn('[cocos-agent] sidebar terminal record unreadable; starting empty', error)
      }
    }
    if (!record.uiDefaultsApplied) {
      if (isCocosAgentPackage()) {
        mainProcessState.store?.updateUI({
          rightSidebarTab: COCOS_AGENT_SIDEBAR_TAB,
          rightSidebarWidth: COCOS_AGENT_SIDEBAR_WIDTH
        })
      }
      record = { ...record, uiDefaultsApplied: true }
      await save(file, record)
    }
    return record
  })
}

export function writeSidebarTerminalRecord(value: unknown): Promise<void> {
  const file = recordPath()
  return withSidecarSnapshotQueue(file, () =>
    save(file, { ...normalizeSidebarTerminalRecord(value), uiDefaultsApplied: true })
  )
}
