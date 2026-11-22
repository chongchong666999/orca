import { editorShutdownUrl } from './cocos-editor-open-output'

export async function readCocosPreviewPort(
  pageUrl: string,
  fetchImpl: typeof globalThis.fetch
): Promise<number | null> {
  const shutdown = editorShutdownUrl(pageUrl)
  if (!shutdown) {
    return null
  }
  const url = new URL(shutdown)
  url.pathname = '/project/devices'
  try {
    const response = await fetchImpl(url.toString(), {
      redirect: 'error',
      signal: AbortSignal.timeout(1500)
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return null
    }
    const value: unknown = await response.json()
    const port = value && typeof value === 'object' && 'port' in value ? value.port : null
    return typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= 65_535
      ? port
      : null
  } catch {
    return null
  }
}
