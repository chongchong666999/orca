// Unpacks the a5-game-context package pinned for a target into resources/cocos-agent/a5-game-context/ for the
// cocos-agent build (a local package, never downloaded). config/cocos-agent/a5-game-context.lock.json pins either
// GitNexus CI's all-platform offline bundle for every target it lists (`targets`), cut down to the target's native
// packages on import, or a single-platform package (`target`, others in a5-game-context.<target>.lock.json).
// Usage: import-a5-game-context.mjs [--target win32-x64]
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const LOCK_DIR = path.join(repoRoot, 'config/cocos-agent')
export const LOCK_PATH = path.join(LOCK_DIR, 'a5-game-context.lock.json')
const DEFAULT_TARGET = 'darwin-arm64'
export const TARGET_DIR = path.join(repoRoot, 'resources/cocos-agent/a5-game-context')
const MARKER = '.cocos-agent-package.json'

/** `A5_GAME_CONTEXT_TARBALL`, else GitNexus's `npm run pack:platform` output beside this checkout. */
export function defaultTarballPath(lock, env = process.env, root = repoRoot) {
  return (
    env.A5_GAME_CONTEXT_TARBALL ||
    path.resolve(root, '..', 'GitNexus', 'context-engine', 'release', lock.file)
  )
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** The lock pinning `target`'s package; every target must pin the version darwin-arm64 does (one version everywhere). */
export function readA5GameContextLock(target = DEFAULT_TARGET, directory = LOCK_DIR) {
  const primaryPath = path.join(directory, 'a5-game-context.lock.json')
  const primaryLock = readJson(primaryPath)
  if (Array.isArray(primaryLock.targets)) {
    if (!primaryLock.targets.includes(target)) {
      throw new Error(
        `${path.relative(repoRoot, primaryPath)} pins no ${target} package (it serves ${primaryLock.targets.join(', ')})`
      )
    }
    return { ...primaryLock, target }
  }
  const lockPath =
    target === DEFAULT_TARGET
      ? primaryPath
      : path.join(directory, `a5-game-context.${target}.lock.json`)
  if (!existsSync(lockPath)) {
    throw new Error(
      `no ${target} a5-game-context package is pinned: add ${path.relative(repoRoot, lockPath)} for the tarball GitNexus's pack:platform --target ${target} makes`
    )
  }
  const lock = readJson(lockPath)
  if (lock.target !== target) {
    throw new Error(`${path.relative(repoRoot, lockPath)} pins ${lock.target}, not ${target}`)
  }
  if (lock.version !== primaryLock.version) {
    throw new Error(
      `a5-game-context ${target} is pinned at ${lock.version} but darwin-arm64 at ${primaryLock.version}; pin the same version on every platform`
    )
  }
  return lock
}

/** An existing install's JSON, or null when it is missing or unreadable (a damaged install is re-imported). */
function readInstalledJson(file) {
  try {
    return readJson(file)
  } catch {
    return null
  }
}

const RESVG_SUFFIX = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'win32-x64': 'win32-x64-msvc'
}

/** What the cocos-agent build, launchers and editor use from the package; mirrors GitNexus's platformRequiredEntries. */
export function requiredPackageEntries(lock) {
  const binary = lock.target.startsWith('win32-') ? 'a5-game-context.exe' : 'a5-game-context'
  const resvg = RESVG_SUFFIX[lock.target] ?? lock.target
  return [
    'dist/cli/index.js',
    'dist/cli/cocos-cli.js',
    'node_modules/@a5labs-prime/cocos-cli/dist/scripts/cocos-cli.js',
    'editor-web/dist/index.html',
    'scripts/install-cocos-cli-bin.cjs',
    'sdk/cocos/2.4.13/cocos-2.4.13.gcdb',
    'vendor/typescript-4.1.3.tgz',
    `node_modules/@resvg/resvg-js-${resvg}/resvgjs.${resvg}.node`,
    `node_modules/@a5labs-prime/a5-game-context-${lock.target}/native-engine/bin/${lock.target}/${binary}`
  ]
}

/** Why the unpacked package at `dir` does not match the lock, or null when it does. */
function packageProblem(dir, lock) {
  const manifest = readInstalledJson(path.join(dir, 'package.json'))
  if (!manifest) {
    return 'package.json is missing or unreadable'
  }
  if (manifest.version !== lock.version) {
    return `package is ${manifest.version}, lock pins ${lock.version}`
  }
  const missing = requiredPackageEntries(lock).filter((entry) => !existsSync(path.join(dir, entry)))
  return missing.length > 0 ? `missing ${missing.join(', ')}` : null
}

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function lockOwner(lockDir) {
  return readInstalledJson(path.join(lockDir, 'owner.json'))?.pid
}

/** Runs `work` holding a cross-process lock on `target`; a lock left by a crashed import is never taken over, only reported. */
function withTargetLock(target, work) {
  const lockDir = `${target}.lock`
  const pending = mkdtempSync(path.join(path.dirname(target), '.a5-game-context-lock-'))
  writeFileSync(path.join(pending, 'owner.json'), JSON.stringify({ pid: process.pid }))
  try {
    // Why: the lock appears with its owner already inside, and renaming onto a held (non-empty) lock fails.
    renameSync(pending, lockDir)
  } catch (error) {
    rmSync(pending, { recursive: true, force: true })
    if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code) || !existsSync(lockDir)) {
      throw error
    }
    const owner = lockOwner(lockDir)
    throw new Error(
      owner && processAlive(owner)
        ? `another a5-game-context import (pid ${owner}) holds ${lockDir}`
        : `${lockDir} was left by an import that is no longer running (pid ${owner ?? 'unknown'}); delete it and retry`,
      { cause: error }
    )
  }
  try {
    return work()
  } finally {
    if (lockOwner(lockDir) === process.pid) {
      rmSync(lockDir, { recursive: true, force: true })
    }
  }
}

/** Puts `source` at `target`, keeping the previous target until the move succeeds and restoring it otherwise. */
function replaceDirectory(source, target) {
  const backup = existsSync(target) ? `${target}.previous-${process.pid}` : null
  if (backup) {
    rmSync(backup, { recursive: true, force: true })
    renameSync(target, backup)
  }
  try {
    renameSync(source, target)
  } catch (error) {
    if (backup) {
      try {
        renameSync(backup, target)
      } catch (restoreError) {
        throw new Error(
          `could not install ${target} (${error.message}) nor restore it; the previous package is at ${backup}`,
          { cause: restoreError }
        )
      }
    }
    throw error
  }
  if (backup) {
    rmSync(backup, { recursive: true, force: true })
  }
}

/** An all-platform package keeps only `target`'s native packages, as a single-platform one ships. */
function keepOnlyTargetNatives(dir, target) {
  for (const [other, resvg] of Object.entries(RESVG_SUFFIX)) {
    if (other !== target) {
      rmSync(path.join(dir, 'node_modules/@a5labs-prime', `a5-game-context-${other}`), {
        recursive: true,
        force: true
      })
      rmSync(path.join(dir, 'node_modules/@resvg', `resvg-js-${resvg}`), {
        recursive: true,
        force: true
      })
    }
  }
}

function installedIntact(targetDir, lock) {
  const installed = readInstalledJson(path.join(targetDir, MARKER))
  return (
    installed?.sha256 === lock.sha256 &&
    installed.version === lock.version &&
    packageProblem(targetDir, lock) === null
  )
}

/** Unpacks the pinned package unless that exact one is already there intact; refuses a missing or mismatched tarball. */
export function importA5GameContext({ lock, tarball, targetDir }) {
  if (installedIntact(targetDir, lock)) {
    return 'unchanged'
  }
  if (!existsSync(tarball)) {
    throw new Error(
      `a5-game-context package not found: ${tarball} (run npm run pack:platform in GitNexus/context-engine, or set A5_GAME_CONTEXT_TARBALL)`
    )
  }
  const actual = sha256File(tarball)
  if (actual !== lock.sha256) {
    throw new Error(
      `a5-game-context package sha256 mismatch for ${tarball}: lock has ${lock.sha256}, file is ${actual}`
    )
  }
  const parent = path.dirname(targetDir)
  mkdirSync(parent, { recursive: true })
  return withTargetLock(targetDir, () => {
    // Why: another import may have finished while this one waited for the lock.
    if (installedIntact(targetDir, lock)) {
      return 'unchanged'
    }
    // Why: unpack beside the target and swap it in whole, so a failed import never leaves a half-written package.
    const staging = mkdtempSync(path.join(parent, '.a5-game-context-'))
    try {
      const untar = spawnSync('tar', ['-xzf', tarball, '-C', staging], { stdio: 'inherit' })
      if (untar.status !== 0) {
        throw new Error(`tar -xzf ${tarball} failed (${untar.status ?? untar.signal})`)
      }
      const unpacked = path.join(staging, 'package')
      const problem = packageProblem(unpacked, lock)
      if (problem) {
        throw new Error(`a5-game-context package ${tarball}: ${problem}`)
      }
      if (Array.isArray(lock.targets)) {
        keepOnlyTargetNatives(unpacked, lock.target)
      }
      writeFileSync(
        path.join(unpacked, MARKER),
        `${JSON.stringify({ version: lock.version, sha256: lock.sha256, target: lock.target }, null, 2)}\n`
      )
      replaceDirectory(unpacked, targetDir)
    } finally {
      rmSync(staging, { recursive: true, force: true })
    }
    return 'imported'
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const targetFlag = process.argv.indexOf('--target')
  const lock = readA5GameContextLock(targetFlag > 0 ? process.argv[targetFlag + 1] : DEFAULT_TARGET)
  const status = importA5GameContext({
    lock,
    tarball: defaultTarballPath(lock),
    targetDir: TARGET_DIR
  })
  console.log(
    `[a5-game-context] ${status === 'unchanged' ? 'already imported' : 'imported'} ${lock.version} (${lock.target}) into ${path.relative(repoRoot, TARGET_DIR)}`
  )
}
