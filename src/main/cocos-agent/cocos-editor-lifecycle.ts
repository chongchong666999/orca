import { z } from 'zod'
import { editorShutdownUrl } from './cocos-editor-open-output'

const editorLifecycleState = z.object({
  closeSupported: z.number().optional(),
  dirty: z.boolean().optional(),
  busy: z.boolean().optional(),
  revision: z.string().optional(),
  documents: z
    .array(z.object({ path: z.string().optional(), dirty: z.boolean().optional() }))
    .optional()
})

export type CocosEditorLifecycleState = z.infer<typeof editorLifecycleState>

/** The editor's `/editor/lifecycle`: whether it can close and which documents have unsaved changes. */
export async function readCocosEditorLifecycleState(
  pageUrl: string,
  fetchImpl: typeof globalThis.fetch = fetch
): Promise<CocosEditorLifecycleState> {
  const shutdown = editorShutdownUrl(pageUrl)
  if (!shutdown) {
    throw new Error('Invalid editor address')
  }
  const url = new URL(shutdown)
  url.pathname = '/editor/lifecycle'
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(3_000), redirect: 'error' })
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error('Could not check unsaved editor changes.')
  }
  return editorLifecycleState.parse(await response.json())
}

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
