// Unpacks the a5-game-context package pinned in config/cocos-agent/a5-game-context.lock.json into
// resources/cocos-agent/a5-game-context/ for the cocos-agent build (a local package, never downloaded).
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
export const LOCK_PATH = path.join(repoRoot, 'config/cocos-agent/a5-game-context.lock.json')
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
      writeFileSync(
        path.join(unpacked, MARKER),
        `${JSON.stringify({ version: lock.version, sha256: lock.sha256 }, null, 2)}\n`
      )
      replaceDirectory(unpacked, targetDir)
    } finally {
      rmSync(staging, { recursive: true, force: true })
    }
    return 'imported'
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const lock = readJson(LOCK_PATH)
  const status = importA5GameContext({
    lock,
    tarball: defaultTarballPath(lock),
    targetDir: TARGET_DIR
  })
  console.log(
    `[a5-game-context] ${status === 'unchanged' ? 'already imported' : 'imported'} ${lock.version} (${lock.target}) into ${path.relative(repoRoot, TARGET_DIR)}`
  )
}
