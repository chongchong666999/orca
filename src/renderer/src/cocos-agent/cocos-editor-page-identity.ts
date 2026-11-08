import type { AppState } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const EDITOR_TAB_MARKER = ['cocos-agent', 'editor'] as const

export function markedEditorUrl(url: string, worktreeId: string): string {
  const parsed = new URL(url)
  parsed.searchParams.set(...EDITOR_TAB_MARKER)
  parsed.searchParams.set('cocos-workspace', worktreeId)
  parsed.searchParams.set('cocos-view', createBrowserUuid())
  return parsed.toString()
}

/** The service origin and token identify an editor independently of its current document. */
export function editorIdentity(url: string, requireMarker: boolean): string | null {
  try {
    const parsed = new URL(url)
    const token = parsed.searchParams.get('token')
    const isEditorPage =
      parsed.protocol === 'http:' &&
      LOOPBACK_HOSTS.has(parsed.hostname) &&
      parsed.pathname === '/' &&
      Boolean(token) &&
      (!requireMarker || parsed.searchParams.get(EDITOR_TAB_MARKER[0]) === EDITOR_TAB_MARKER[1])
    return isEditorPage ? `${parsed.origin}\0${token}` : null
  } catch {
    return null
  }
}

export function isCocosEditorPageUrl(url: string): boolean {
  return editorIdentity(url, true) !== null
}

export function findEditorPageTabs(
  state: AppState,
  worktreeId: string
): { tabId: string; identity: string }[] {
  return (state.browserTabsByWorktree[worktreeId] ?? []).flatMap((tab) => {
    const identity = (state.browserPagesByWorkspace[tab.id] ?? [])
      .map((page) => editorIdentity(page.url, true))
      .find((value) => value !== null)
    return identity ? [{ tabId: tab.id, identity }] : []
  })
}
