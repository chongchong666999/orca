import { describe, expect, it } from 'vitest'
import { editorShutdownUrl, parseEditorOpenOutput } from './cocos-editor-open-output'

describe('parseEditorOpenOutput', () => {
  it('reads the open event after unrelated output', () => {
    const stdout = [
      'warming up',
      '{"event":"open","url":"http://127.0.0.1:51234/?token=abc&doc=assets%2Fa.prefab","project":"/p/game","doc":"assets/a.prefab","running":true}',
      ''
    ].join('\n')
    expect(parseEditorOpenOutput(stdout)).toEqual({
      url: 'http://127.0.0.1:51234/?token=abc&doc=assets%2Fa.prefab',
      projectRoot: '/p/game',
      reused: true
    })
  })

  it('rejects pages that are not local or carry no token', () => {
    expect(
      parseEditorOpenOutput('{"url":"http://10.0.0.5:51234/?token=abc","project":"/p/game"}')
    ).toBeNull()
    expect(
      parseEditorOpenOutput('{"url":"http://127.0.0.1:51234/","project":"/p/game"}')
    ).toBeNull()
  })
})

describe('editorShutdownUrl', () => {
  it('targets the editor origin with its token', () => {
    expect(editorShutdownUrl('http://127.0.0.1:51234/?token=a%2Bb&doc=assets%2Fa.prefab')).toBe(
      'http://127.0.0.1:51234/shutdown?token=a%2Bb'
    )
  })
})
