import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  A5ToolchainFailureCode,
  A5ToolchainState
} from '../../shared/cocos-agent/a5-game-context-toolchain-types'
import { quoteStartupArg } from '../../shared/agent-launch/startup/tui-agent-startup-shell'
import type { ToolchainProbe } from './a5-game-context-toolchain-probe'

export type ToolchainSettings = {
  autoInstall: boolean
  /** The last install that failed, for the bundled version it tried; cleared once one succeeds. */
  failure?: { bundledVersion: string; code: A5ToolchainFailureCode; detail: string }
}

function versionParts(version: string): number[] {
  return version
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
}

export function compareVersions(a: string, b: string): number {
  const left = versionParts(a)
  const right = versionParts(b)
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) {
      return Math.sign(difference)
    }
  }
  return 0
}

/** The state a probe puts the global copy in against the bundled version (`failed` aside). */
export function deriveToolchainState(
  probe: Pick<ToolchainProbe, 'npm' | 'globalVersion' | 'cocosCliPath' | 'sdkRegistered'>,
  bundledVersion: string
): A5ToolchainState {
  if (!probe.npm) {
    return 'no-npm'
  }
  if (!probe.globalVersion) {
    return 'missing'
  }
  if (versionParts(probe.globalVersion)[0] !== versionParts(bundledVersion)[0]) {
    return 'incompatible'
  }
  if (compareVersions(probe.globalVersion, bundledVersion) < 0) {
    return 'outdated'
  }
  return probe.cocosCliPath && probe.sdkRegistered ? 'ready' : 'incomplete'
}

export function needsInstall(state: A5ToolchainState): boolean {
  return state === 'missing' || state === 'outdated' || state === 'incomplete'
}

export async function readToolchainSettings(file: string): Promise<ToolchainSettings> {
  try {
    const value: unknown = JSON.parse(await readFile(file, 'utf8'))
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
    const failure = record.failure as ToolchainSettings['failure'] | undefined
    return {
      autoInstall: record.autoInstall !== false,
      ...(failure && typeof failure.bundledVersion === 'string' ? { failure } : {})
    }
  } catch {
    return { autoInstall: true }
  }
}

export async function writeToolchainSettings(file: string, settings: ToolchainSettings): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(settings, null, 2)}\n`)
}

/** Runs the npm global copy with the user's Node: a GUI app's PATH lacks it (nvm, fnm), and the CLI starts Node workers. */
export function globalLauncherScript(node: string, packageDir: string): string {
  const quotedNode = quoteStartupArg(node, 'posix')
  return [
    '#!/bin/sh',
    `PATH=${quoteStartupArg(path.dirname(node), 'posix')}:"$PATH"`,
    `A5_NODE_EXE=${quotedNode}`,
    `A5_NODE_BINARY=${quotedNode}`,
    'export PATH A5_NODE_EXE A5_NODE_BINARY',
    `exec ${quotedNode} ${quoteStartupArg(path.join(packageDir, 'dist', 'cli', 'index.js'), 'posix')} "$@"`,
    ''
  ].join('\n')
}
