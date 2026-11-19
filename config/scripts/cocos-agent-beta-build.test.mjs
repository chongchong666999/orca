import { describe, expect, it } from 'vitest'
import { createCocosAgentBetaBuild, readCocosAgentVersion } from './cocos-agent-beta-build.mjs'

describe('createCocosAgentBetaBuild', () => {
  it('names a beta build by cocos-agent version, local date and time, and commit', () => {
    expect(createCocosAgentBetaBuild('0.1.1', new Date(2026, 10, 19, 9, 5), 'dfca0ec26289')).toBe(
      '0.1.1-20261119-0905-dfca0ec26289'
    )
  })

  it('sanitizes the commit as the local build version does', () => {
    expect(createCocosAgentBetaBuild('0.1.1', new Date(2026, 0, 2, 13, 40), 'abc/def')).toBe(
      '0.1.1-20260102-1340-abcdef'
    )
  })
})

describe('readCocosAgentVersion', () => {
  it('reads the release number cocos-agent-version.ts declares', () => {
    expect(readCocosAgentVersion("export const COCOS_AGENT_VERSION = '2.3.4'\n")).toBe('2.3.4')
    expect(() => readCocosAgentVersion('export const OTHER = 1\n')).toThrow()
  })
})
