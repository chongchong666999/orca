import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import type {
  CocosEditorRecord,
  CocosRunningService
} from '../../shared/cocos-agent/cocos-editor-types'
import { isJsonRecord } from '../../shared/cocos-agent/cocos-json-record'
import { readCocosEditorLifecycleState } from './cocos-editor-lifecycle'
import { editorShutdownUrl, isSameEditor } from './cocos-editor-open-output'
import { readCocosPreviewPort } from './cocos-preview-port'
import { findCocosEditorForWorkspace } from './cocos-project-detection'

export async function findRunningCocosEditor(
  projectPath: string,
  fetchImpl: typeof fetch
): Promise<CocosEditorRecord | undefined> {
  const running = await listCocosRunningServices([], fetchImpl)
  return findCocosEditorForWorkspace(
    projectPath,
    running.map((service) => ({ ...service, startedByApp: false }))
  )
}

const PROBE_TIMEOUT_MS = 1_500

/** GitNexus's context home (`profile::context_home_dir`): `A5_CONTEXT_HOME_DIR`, else `~/.context-engine`. */
export function a5ContextHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.A5_CONTEXT_HOME_DIR?.trim()
  if (configured) {
    return configured === '~' || configured.startsWith('~/') || configured.startsWith('~\\')
      ? path.join(homedir(), configured.slice(1))
      : configured
  }
  return path.join(homedir(), '.context-engine')
}

/** The editors GitNexus noted as running (`editor/running/<hash>.json`: pid, project, url, token), stale ones included. */
export async function readRunningEditorNotes(
  contextHome: string = a5ContextHomeDir()
): Promise<CocosEditorRecord[]> {
  const directory = path.join(contextHome, 'editor', 'running')
  const names = await readdir(directory).catch(() => [])
  const records = await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map(async (name): Promise<CocosEditorRecord | null> => {
        try {
          const note: unknown = JSON.parse(await readFile(path.join(directory, name), 'utf8'))
          if (!isJsonRecord(note)) {
            return null
          }
          const { project, url, token } = note
          if (typeof project !== 'string' || typeof url !== 'string' || typeof token !== 'string') {
            return null
          }
          const page = new URL(url)
          page.pathname = '/'
          page.search = ''
          page.searchParams.set('token', token)
          // Why: only a loopback editor may receive its token (same rule as `editor open` output).
          return editorShutdownUrl(page.toString())
            ? { projectRoot: project, url: page.toString(), startedByApp: false }
            : null
        } catch {
          return null
        }
      })
  )
  return records.filter((record): record is CocosEditorRecord => record !== null)
}

async function probe(
  record: CocosEditorRecord,
  origin: CocosRunningService['origin'],
  fetchImpl: typeof globalThis.fetch
): Promise<CocosRunningService | null> {
  const timedFetch: typeof globalThis.fetch = (input, init) =>
    fetchImpl(input, { ...init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
  try {
    const [state, previewPort] = await Promise.all([
      readCocosEditorLifecycleState(record.url, timedFetch),
      readCocosPreviewPort(record.url, fetchImpl)
    ])
    return {
      projectRoot: record.projectRoot,
      url: record.url,
      origin,
      previewPort,
      unsavedDocuments: (state.documents ?? []).filter((document) => document.dirty).length
    }
  } catch {
    // Why: a stale note's port may now belong to another program; only an editor that answers with its token counts.
    return null
  }
}

/** Every editor service that answers: the app's own (`known`) first, then those agents or the CLI started. */
export async function listCocosRunningServices(
  known: CocosEditorRecord[],
  fetchImpl: typeof globalThis.fetch = fetch,
  notes?: CocosEditorRecord[]
): Promise<CocosRunningService[]> {
  const others = (notes ?? (await readRunningEditorNotes())).filter(
    (note) => !known.some((record) => isSameEditor(record.url, note.url))
  )
  const services = await Promise.all([
    ...known.map((record) => probe(record, record.startedByApp ? 'app' : 'external', fetchImpl)),
    ...others.map((record) => probe(record, 'external', fetchImpl))
  ])
  return services.filter((service): service is CocosRunningService => service !== null)
}
