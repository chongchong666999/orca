import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  downloadA5GameContext,
  importA5GameContext,
  readA5GameContextLock,
  requiredPackageEntries
} from './import-a5-game-context.mjs'

describe('importA5GameContext', () => {
  let work
  let tarball
  let lock

  beforeEach(() => {
    work = mkdtempSync(path.join(os.tmpdir(), 'import-a5-game-context-'))
    const packageDir = path.join(work, 'src', 'package')
    for (const entry of requiredPackageEntries({ target: 'darwin-arm64' })) {
      mkdirSync(path.dirname(path.join(packageDir, entry)), { recursive: true })
      writeFileSync(path.join(packageDir, entry), '')
    }
    writeFileSync(path.join(packageDir, 'package.json'), '{"version":"3.8.270"}')
    tarball = path.join(work, 'a5.tgz')
    execFileSync('tar', ['-czf', tarball, '-C', path.join(work, 'src'), 'package'])
    lock = {
      version: '3.8.270',
      target: 'darwin-arm64',
      sha256: createHash('sha256').update(readFileSync(tarball)).digest('hex')
    }
  })

  afterEach(() => {
    rmSync(work, { recursive: true, force: true })
  })

  it('unpacks the pinned package once and skips it after', () => {
    const targetDir = path.join(work, 'resources', 'a5-game-context')
    expect(importA5GameContext({ lock, tarball, targetDir })).toBe('imported')
    expect(readFileSync(path.join(targetDir, 'package.json'), 'utf8')).toBe('{"version":"3.8.270"}')
    expect(importA5GameContext({ lock, tarball, targetDir })).toBe('unchanged')
  })

  it('re-imports a package that was damaged after an earlier import', () => {
    const targetDir = path.join(work, 'resources', 'a5-game-context')
    importA5GameContext({ lock, tarball, targetDir })
    rmSync(path.join(targetDir, 'dist', 'cli', 'index.js'))
    expect(importA5GameContext({ lock, tarball, targetDir })).toBe('imported')
    expect(existsSync(path.join(targetDir, 'dist', 'cli', 'index.js'))).toBe(true)
  })

  it('re-imports an install whose package.json became unreadable', () => {
    const targetDir = path.join(work, 'resources', 'a5-game-context')
    importA5GameContext({ lock, tarball, targetDir })
    writeFileSync(path.join(targetDir, 'package.json'), '{"version":')
    expect(importA5GameContext({ lock, tarball, targetDir })).toBe('imported')
  })

  it('refuses to import while another live import holds the target', () => {
    const targetDir = path.join(work, 'resources', 'a5-game-context')
    mkdirSync(`${targetDir}.lock`, { recursive: true })
    writeFileSync(
      path.join(`${targetDir}.lock`, 'owner.json'),
      JSON.stringify({ pid: process.pid })
    )
    expect(() => importA5GameContext({ lock, tarball, targetDir })).toThrow(
      'another a5-game-context import'
    )
    expect(existsSync(targetDir)).toBe(false)
  })

  it('refuses a tarball whose sha256 or version differs from the lock', () => {
    const targetDir = path.join(work, 'resources', 'a5-game-context')
    expect(() =>
      importA5GameContext({ lock: { ...lock, sha256: '0'.repeat(64) }, tarball, targetDir })
    ).toThrow('sha256 mismatch')
    expect(() =>
      importA5GameContext({ lock: { ...lock, version: '3.8.271' }, tarball, targetDir })
    ).toThrow('lock pins 3.8.271')
  })
})

describe('readA5GameContextLock', () => {
  it('refuses a platform pinned at another version than darwin-arm64', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'a5-game-context-locks-'))
    try {
      writeFileSync(
        path.join(directory, 'a5-game-context.lock.json'),
        '{"version":"3.8.285","target":"darwin-arm64"}'
      )
      writeFileSync(
        path.join(directory, 'a5-game-context.win32-x64.lock.json'),
        '{"version":"3.8.283","target":"win32-x64"}'
      )
      expect(() => readA5GameContextLock('win32-x64', directory)).toThrow(
        'a5-game-context win32-x64 is pinned at 3.8.283 but darwin-arm64 at 3.8.285; pin the same version on every platform'
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('an all-platform package', () => {
  it("serves every listed target from one pin and keeps only that target's native packages", () => {
    const work = mkdtempSync(path.join(os.tmpdir(), 'a5-all-platform-'))
    try {
      const packageDir = path.join(work, 'src', 'package')
      const entries = new Set([
        ...requiredPackageEntries({ target: 'darwin-arm64' }),
        ...requiredPackageEntries({ target: 'win32-x64' }),
        'node_modules/@a5labs-prime/a5-game-context-darwin-x64/package.json',
        'node_modules/@resvg/resvg-js-darwin-x64/package.json'
      ])
      for (const entry of entries) {
        mkdirSync(path.dirname(path.join(packageDir, entry)), { recursive: true })
        writeFileSync(path.join(packageDir, entry), '')
      }
      writeFileSync(path.join(packageDir, 'package.json'), '{"version":"5.0.1"}')
      const tarball = path.join(work, 'all.tgz')
      execFileSync('tar', ['-czf', tarball, '-C', path.join(work, 'src'), 'package'])
      const locks = path.join(work, 'locks')
      mkdirSync(locks)
      writeFileSync(
        path.join(locks, 'a5-game-context.lock.json'),
        JSON.stringify({
          version: '5.0.1',
          targets: ['darwin-arm64', 'win32-x64'],
          sha256: createHash('sha256').update(readFileSync(tarball)).digest('hex')
        })
      )
      const targetDir = path.join(work, 'installed')
      const kept = () => [
        ...readdirSync(path.join(targetDir, 'node_modules/@a5labs-prime')),
        ...readdirSync(path.join(targetDir, 'node_modules/@resvg'))
      ]
      const install = (target) =>
        importA5GameContext({ lock: readA5GameContextLock(target, locks), tarball, targetDir })

      expect(install('win32-x64')).toBe('imported')
      expect(kept().sort()).toEqual([
        'a5-game-context-win32-x64',
        'cocos-cli',
        'resvg-js-win32-x64-msvc'
      ])
      expect(install('darwin-arm64')).toBe('imported')
      expect(kept().sort()).toEqual([
        'a5-game-context-darwin-arm64',
        'cocos-cli',
        'resvg-js-darwin-arm64'
      ])
      expect(install('darwin-arm64')).toBe('unchanged')
      expect(() => readA5GameContextLock('darwin-x64', locks)).toThrow(/pins no darwin-x64 package/)
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })
})

describe('downloadA5GameContext', () => {
  it("fetches the pinned file from the lock's release with gh and says how to get access when gh fails", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'a5-download-'))
    try {
      const lock = {
        file: 'a5.tgz',
        release: { repo: 'A5Labs-Prime/a5-game-context-server', tag: 'v5.0.1' }
      }
      const calls = []
      downloadA5GameContext(lock, directory, (program, args) => {
        calls.push([program, ...args])
        return { status: 0 }
      })
      expect(calls).toEqual([
        [
          'gh',
          'release',
          'download',
          'v5.0.1',
          '--repo',
          'A5Labs-Prime/a5-game-context-server',
          '--pattern',
          'a5.tgz',
          '--dir',
          directory,
          '--clobber'
        ]
      ])
      expect(() => downloadA5GameContext(lock, directory, () => ({ status: 1 }))).toThrow(
        'could not download a5.tgz from A5Labs-Prime/a5-game-context-server v5.0.1: run gh auth login with an account that can read A5Labs-Prime/a5-game-context-server, or set A5_GAME_CONTEXT_TARBALL'
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
