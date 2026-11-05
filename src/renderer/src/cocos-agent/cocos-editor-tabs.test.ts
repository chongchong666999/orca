import { describe, expect, it } from 'vitest'
import type { AppState } from '@/store'
import { findEditorPageTabs } from './cocos-editor-tabs'

function stateWithPages(urlsByTab: Record<string, string>): AppState {
  const tabIds = Object.keys(urlsByTab)
  return {
    browserTabsByWorktree: { wt: tabIds.map((id) => ({ id })) },
    browserPagesByWorkspace: Object.fromEntries(
      tabIds.map((id) => [id, [{ id: `${id}-page`, url: urlsByTab[id] }]])
    )
  } as unknown as AppState
}

describe('findEditorPageTabs', () => {
  it('recognizes only editor pages cocos-agent opened', () => {
    const state = stateWithPages({
      editor: 'http://127.0.0.1:40000/?token=t1&doc=assets%2Fa.prefab&cocos-agent=editor',
      jupyter: 'http://localhost:8888/?token=abc',
      remote: 'http://10.0.0.5:40000/?token=t1&cocos-agent=editor'
    })

    expect(findEditorPageTabs(state, 'wt')).toEqual([
      { tabId: 'editor', identity: 'http://127.0.0.1:40000\0t1' }
    ])
  })
})
