import { describe, expect, it } from 'vitest'
import {
  changedUpstreamFiles,
  findStale,
  findUnregistered,
  renderTouchPointsTable,
  replaceDocSection,
  validateEntries
} from './check-upstream-touch-points.mjs'

const entry = (path, kind = 'hook') => ({
  path,
  kind,
  change: 'import + 1 call',
  onConflict: 'keep upstream, re-add the call'
})

describe('upstream touch points', () => {
  it('registers every modified, deleted or renamed upstream file and ignores additions', () => {
    const changed = changedUpstreamFiles(
      [
        'M\tsrc/preload/index.ts',
        'A\tsrc/main/cocos-agent/new.ts',
        'D\tsrc/old.ts',
        'R100\tsrc/a.ts\tsrc/b.ts'
      ].join('\n')
    )
    expect(changed.map((item) => item.path)).toEqual([
      'src/preload/index.ts',
      'src/old.ts',
      'src/b.ts'
    ])
    expect(findUnregistered(changed, [entry('src/preload/index.ts')])).toEqual([
      'src/old.ts',
      'src/b.ts'
    ])
    expect(findStale(changed, [entry('src/preload/index.ts'), entry('src/gone.ts')])).toEqual([
      'src/gone.ts'
    ])
  })

  it('renders the table into the marked section and rejects malformed entries', () => {
    const doc =
      '# cocos-agent\n\n<!-- touch-points:start -->\nold\n<!-- touch-points:end -->\n\n## next\n'
    const table = renderTouchPointsTable([entry('src/b.ts', 'brand'), entry('src/a.ts')])
    const next = replaceDocSection(doc, table)
    expect(next).toContain('| `src/a.ts` | 挂点 |')
    expect(next.indexOf('`src/a.ts`')).toBeLessThan(next.indexOf('`src/b.ts`'))
    expect(next).toContain('<!-- touch-points:end -->\n\n## next')
    expect(replaceDocSection(next, table)).toBe(next)
    expect(
      validateEntries([entry('src/a.ts'), entry('src/a.ts'), { path: 'src/c.ts', kind: 'odd' }])
    ).toEqual([
      'src/a.ts: listed twice',
      'src/c.ts: missing change',
      'src/c.ts: missing onConflict',
      'src/c.ts: unknown kind odd'
    ])
  })
})
