import { editorShutdownUrl } from './cocos-editor-open-output'

export type CocosEditorLifecycle = 'idle' | 'protected' | 'gone'

export async function readCocosEditorLifecycle(
  pageUrl: string,
  fetch: typeof globalThis.fetch
): Promise<CocosEditorLifecycle> {
  const shutdown = editorShutdownUrl(pageUrl)
  if (!shutdown) {
    return 'protected'
  }
  const url = new URL(shutdown)
  url.pathname = '/editor/lifecycle'
  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(3_000),
      redirect: 'error'
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return 'protected'
    }
    const state: unknown = await response.json()
    return state &&
      typeof state === 'object' &&
      'dirty' in state &&
      state.dirty === false &&
      'busy' in state &&
      state.busy === false
      ? 'idle'
      : 'protected'
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined
    return cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ECONNREFUSED'
      ? 'gone'
      : 'protected'
  }
}
