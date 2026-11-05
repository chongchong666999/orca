const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

export type EditorOpenOutput = { url: string; projectRoot: string; reused: boolean }

function loopbackPageUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  try {
    const url = new URL(value)
    // Why: the page URL carries the session token, so only a local editor may receive it.
    const isLocalEditor = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
    return isLocalEditor && url.searchParams.get('token') ? url.toString() : null
  } catch {
    return null
  }
}

/** The JSON line `a5-game-context editor open` prints: `{"event":"open","url","project","running"}`. */
export function parseEditorOpenOutput(stdout: string): EditorOpenOutput | null {
  const lines = stdout.split(/\r?\n/).toReversed()
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) {
      continue
    }
    let value: unknown
    try {
      value = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (!value || typeof value !== 'object') {
      continue
    }
    const record = value as Record<string, unknown>
    const url = loopbackPageUrl(record.url)
    if (url && typeof record.project === 'string' && record.project) {
      return { url, projectRoot: record.project, reused: record.running === true }
    }
  }
  return null
}

/** The editor's origin and session token, for `POST /shutdown?token=`. */
export function editorShutdownUrl(pageUrl: string): string | null {
  const page = loopbackPageUrl(pageUrl)
  if (!page) {
    return null
  }
  const url = new URL(page)
  const shutdown = new URL('/shutdown', url.origin)
  shutdown.searchParams.set('token', url.searchParams.get('token') ?? '')
  return shutdown.toString()
}
