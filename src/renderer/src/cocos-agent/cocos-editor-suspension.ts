import { useSyncExternalStore } from 'react'

const suspendedTabs = new Set<string>()
const evictedIdentities = new Set<string>()
const listeners = new Set<() => void>()

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
  for (const listener of listeners) {
    listener()
  }
}

export function useCocosEditorSuspended(tabId: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => isCocosEditorSuspended(tabId),
    () => false
  )
}

export function markCocosEditorEvicted(identity: string): void {
  evictedIdentities.add(identity)
}

export function wasCocosEditorEvicted(identity: string): boolean {
  return evictedIdentities.has(identity)
}
