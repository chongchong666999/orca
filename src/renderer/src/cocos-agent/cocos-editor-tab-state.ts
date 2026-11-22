import { useEffect, useState, useSyncExternalStore } from 'react'
import { editorIdentity } from './cocos-editor-page-identity'
import { cocosAgentApi } from './cocos-workspace-project'

const suspendedTabs = new Set<string>()
const evictedIdentities = new Set<string>()
/** Editors this app session started or reused; a restored tab showing another one points at an exited editor. */
const liveIdentities = new Set<string>()
/** Opens and restorations in flight, by workspace. */
const startsByWorktree = new Map<string, number>()
/** Workspaces with an open or restoration that finished, whatever its outcome. */
const settledWorktrees = new Set<string>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isCocosEditorSuspended(tabId: string): boolean {
  return suspendedTabs.has(tabId)
}

export function setCocosEditorSuspended(tabId: string, suspended: boolean): void {
  if (suspended === suspendedTabs.has(tabId)) {
    return
  }
  if (suspended) {
    suspendedTabs.add(tabId)
  } else {
    suspendedTabs.delete(tabId)
  }
  notify()
}

/** Workspaces whose editor Stop all Cocos services handed back to Cocos Creator; they stay stopped until resumed. */
const handedBackWorktrees = new Set<string>()

export function setCocosEditorHandedBack(worktreeId: string, handedBack: boolean): void {
  if (handedBack === handedBackWorktrees.has(worktreeId)) {
    return
  }
  if (handedBack) {
    handedBackWorktrees.add(worktreeId)
  } else {
    handedBackWorktrees.delete(worktreeId)
  }
  notify()
}

export function isCocosEditorHandedBack(worktreeId: string): boolean {
  return handedBackWorktrees.has(worktreeId)
}

export function useCocosEditorHandedBack(worktreeId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => handedBackWorktrees.has(worktreeId),
    () => false
  )
}

export function markCocosEditorEvicted(identity: string): void {
  evictedIdentities.add(identity)
}

export function wasCocosEditorEvicted(identity: string): boolean {
  return evictedIdentities.has(identity)
}

export function markCocosEditorLive(identity: string): void {
  if (!liveIdentities.has(identity)) {
    liveIdentities.add(identity)
    notify()
  }
}

/** Marks an open of the workspace's editor in flight; the returned function ends it. */
export function beginCocosEditorStart(worktreeId: string): () => void {
  startsByWorktree.set(worktreeId, (startsByWorktree.get(worktreeId) ?? 0) + 1)
  notify()
  let ended = false
  return () => {
    if (ended) {
      return
    }
    ended = true
    const remaining = (startsByWorktree.get(worktreeId) ?? 1) - 1
    if (remaining > 0) {
      startsByWorktree.set(worktreeId, remaining)
    } else {
      startsByWorktree.delete(worktreeId)
    }
    settledWorktrees.add(worktreeId)
    notify()
  }
}

/**
 * What an editor tab shows. `starting`: its editor is being opened, or a tab restored from an earlier session waits
 * for its first open (its address is dead until then). `loading`: its live page loads under the starting screen.
 * `stopped`/`suspended`: nothing is opening it.
 */
export type CocosEditorTabView = 'page' | 'loading' | 'starting' | 'stopped' | 'suspended'

export function cocosEditorTabView(
  tabId: string,
  worktreeId: string,
  page: { url: string; loading: boolean } | null
): CocosEditorTabView {
  const starting = startsByWorktree.has(worktreeId)
  if (suspendedTabs.has(tabId)) {
    return starting ? 'starting' : 'suspended'
  }
  const identity = page ? editorIdentity(page.url, true) : null
  // Why: without cocos-agent in this window nothing would ever open the editor, so the page stays as it is.
  if (!identity || !cocosAgentApi()) {
    return 'page'
  }
  if (liveIdentities.has(identity)) {
    return page?.loading ? 'loading' : 'page'
  }
  return starting || !settledWorktrees.has(worktreeId) ? 'starting' : 'stopped'
}

export function useCocosEditorTabView(
  tabId: string,
  worktreeId: string,
  page: { url: string; loading: boolean } | null
): CocosEditorTabView {
  const url = page?.url ?? null
  const loading = page?.loading ?? false
  return useSyncExternalStore(
    subscribe,
    () => cocosEditorTabView(tabId, worktreeId, url === null ? null : { url, loading }),
    () => 'page'
  )
}

/** Holds the cover a moment past the page's load, until the guest has presented the page's own first frame. */
const COVER_HOLD_MS = 150

export function useCocosEditorCover(loading: boolean): boolean {
  const [held, setHeld] = useState(loading)
  useEffect(() => {
    if (loading) {
      setHeld(true)
      return
    }
    const timer = window.setTimeout(() => setHeld(false), COVER_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [loading])
  return loading || held
}
