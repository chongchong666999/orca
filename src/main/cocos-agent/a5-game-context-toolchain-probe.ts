import { lstat, readFile, readdir, readlink, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { ProcessResult, ProcessSpec } from '@orca/process-host/process-spec'
import type { A5ToolchainOtherCopy } from '../../shared/cocos-agent/a5-game-context-toolchain-types'
import {
  isExecutableFile,
  isPathInsideOrEqual,
  splitPathEntries
} from '../cli/command-paths/cli-install-path-format'

export const A5_PACKAGE_NAME = '@a5labs-prime/a5-game-context'
const COMMANDS = ['a5-game-context', 'cocos-cli'] as const

export type ToolchainProbeInput = {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  home: string
  contextHome: string
  run: (spec: ProcessSpec) => Promise<ProcessResult>
}

export type ToolchainProbe = {
  npm: string | null
  node: string | null
  nodeVersion: string | null
  prefix: string | null
  /** The npm global package folder, when the package is installed there. */
  packageDir: string | null
  globalVersion: string | null
  commandPath: string | null
  /** The command PATH finds when it is not the npm global one. */
  shadowedBy: string | null
  cocosCliPath: string | null
  sdkRegistered: boolean
  otherCopies: A5ToolchainOtherCopy[]
}

function commandNames(platform: NodeJS.Platform, name: string): string[] {
  return platform === 'win32' ? [`${name}.cmd`, `${name}.exe`, name] : [name]
}

export async function findOnPath(
  name: string,
  platform: NodeJS.Platform,
  pathValue: string | undefined
): Promise<string | null> {
  for (const entry of splitPathEntries(platform, pathValue ?? null)) {
    for (const candidate of commandNames(platform, name)) {
      const file = path.join(entry, candidate)
      if (await isExecutableFile(file)) {
        return file
      }
    }
  }
  return null
}

export function globalPackageDir(platform: NodeJS.Platform, prefix: string): string {
  return platform === 'win32'
    ? path.join(prefix, 'node_modules', '@a5labs-prime', 'a5-game-context')
    : path.join(prefix, 'lib', 'node_modules', '@a5labs-prime', 'a5-game-context')
}

/** The npm prefix a package folder sits in (`<prefix>/lib/node_modules/@scope/name`, Windows without `lib`). */
function prefixOfPackageDir(platform: NodeJS.Platform, packageDir: string): string {
  return path.resolve(packageDir, platform === 'win32' ? '../../..' : '../../../..')
}

export async function readPackageVersion(packageDir: string): Promise<string | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'))
    if (!value || typeof value !== 'object') {
      return null
    }
    const { name, version } = value as Record<string, unknown>
    return name === A5_PACKAGE_NAME && typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

/** The version of the package a command resolves into: its own folder upward, or an app's `Resources/a5-game-context`. */
async function versionBehindCommand(command: string): Promise<string | null> {
  const target = await realpath(command).catch(() => command)
  let directory = path.dirname(target)
  for (let depth = 0; depth < 6; depth++) {
    const version =
      (await readPackageVersion(directory)) ??
      (await readPackageVersion(path.join(directory, 'a5-game-context')))
    if (version) {
      return version
    }
    const parent = path.dirname(directory)
    if (parent === directory) {
      break
    }
    directory = parent
  }
  return null
}

async function isIn(
  command: string,
  packageDir: string,
  platform: NodeJS.Platform,
  prefix: string
): Promise<boolean> {
  if (platform === 'win32') {
    // npm's .cmd shims sit in the prefix itself and call into the package.
    return path.dirname(command).toLowerCase() === prefix.toLowerCase()
  }
  const target = await realpath(command).catch(() => null)
  return target !== null && isPathInsideOrEqual(packageDir, target)
}

async function sdkRegistered(contextHome: string): Promise<boolean> {
  try {
    const registry: unknown = JSON.parse(
      await readFile(path.join(contextHome, 'sdk', 'registry.json'), 'utf8')
    )
    return (
      Array.isArray(registry) &&
      registry.some(
        (entry) =>
          entry && typeof entry === 'object' && entry.kind === 'cocos' && entry.version === '2.4.13'
      )
    )
  } catch {
    return false
  }
}

async function childFolders(parent: string): Promise<string[]> {
  return (await readdir(parent).catch(() => [])).map((name) => path.join(parent, name))
}

/** npm global folders version managers and system installs keep besides the current prefix. */
async function candidatePrefixes(
  platform: NodeJS.Platform,
  home: string,
  env: NodeJS.ProcessEnv
): Promise<string[]> {
  if (platform === 'win32') {
    const roots = [
      env.APPDATA ? path.join(env.APPDATA, 'npm') : null,
      ...(env.NVM_HOME ? await childFolders(env.NVM_HOME) : [])
    ]
    return roots.filter((root): root is string => root !== null)
  }
  return [
    ...(await childFolders(path.join(home, '.nvm', 'versions', 'node'))),
    ...(
      await childFolders(path.join(home, 'Library', 'Application Support', 'fnm', 'node-versions'))
    ).map((folder) => path.join(folder, 'installation')),
    ...(await childFolders(path.join(home, '.local', 'share', 'fnm', 'node-versions'))).map(
      (folder) => path.join(folder, 'installation')
    ),
    '/opt/homebrew',
    '/usr/local'
  ]
}

function quote(platform: NodeJS.Platform, value: string): string {
  return platform === 'win32' ? `"${value}"` : `'${value.replaceAll("'", `'\\''`)}'`
}

async function findOtherCopies(
  input: ToolchainProbeInput,
  current: { prefix: string | null; packageDir: string | null }
): Promise<A5ToolchainOtherCopy[]> {
  const copies: A5ToolchainOtherCopy[] = []
  const canonical = async (folder: string): Promise<string> =>
    (await realpath(folder).catch(() => folder)).toLowerCase()
  const seen = new Set<string>(current.packageDir ? [await canonical(current.packageDir)] : [])
  for (const prefix of await candidatePrefixes(input.platform, input.home, input.env)) {
    const packageDir = globalPackageDir(input.platform, prefix)
    const version = await readPackageVersion(packageDir)
    const key = await canonical(packageDir)
    if (!version || seen.has(key)) {
      continue
    }
    seen.add(key)
    copies.push({
      kind: 'package',
      version,
      location: packageDir,
      removeCommand: `npm rm -g --prefix ${quote(input.platform, prefixOfPackageDir(input.platform, packageDir))} ${A5_PACKAGE_NAME}`
    })
  }
  if (input.platform === 'win32') {
    return copies
  }
  // Links someone made to a copy other than the npm global one (cocos-agent's own old links are removed on launch).
  const linkFolders = [
    path.join(input.home, '.local', 'bin'),
    path.join(input.home, 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ]
  for (const folder of linkFolders) {
    if (current.prefix && path.join(current.prefix, 'bin') === folder) {
      continue
    }
    for (const name of COMMANDS) {
      const link = path.join(folder, name)
      const isLink = await lstat(link).then(
        (stats) => stats.isSymbolicLink(),
        () => false
      )
      if (!isLink || isCocosAgentAppLink(await readlink(link).catch(() => ''), name)) {
        continue
      }
      if (current.packageDir && (await isIn(link, current.packageDir, input.platform, current.prefix ?? ''))) {
        continue
      }
      copies.push({
        kind: 'link',
        version: await versionBehindCommand(link),
        location: link,
        removeCommand: `rm ${quote(input.platform, link)}`
      })
    }
  }
  return copies
}

/** A link cocos-agent 0.1.2 and earlier made to an app's bundled launcher. */
export function isCocosAgentAppLink(target: string, name: string): boolean {
  return target.endsWith(`.app/Contents/Resources/bin/${name}`)
}

async function runText(
  input: ToolchainProbeInput,
  program: string,
  args: string[]
): Promise<string | null> {
  try {
    const result = await input.run({ program, args, env: input.env, timeoutMs: 20_000 })
    return result.code === 0 ? result.stdout.trim() : null
  } catch {
    return null
  }
}

/** What the login shell sees: npm and its node, the global a5-game-context, cocos-cli, the SDK and other copies. */
export async function probeA5Toolchain(input: ToolchainProbeInput): Promise<ToolchainProbe> {
  const pathValue = input.env.PATH ?? input.env.Path
  const npm = await findOnPath('npm', input.platform, pathValue)
  const besideNpm = npm
    ? path.join(path.dirname(npm), input.platform === 'win32' ? 'node.exe' : 'node')
    : null
  const node =
    besideNpm && (await isExecutableFile(besideNpm))
      ? besideNpm
      : await findOnPath('node', input.platform, pathValue)
  const prefix = npm ? await runText(input, npm, ['prefix', '-g']) : null
  const installedDir = prefix ? globalPackageDir(input.platform, prefix) : null
  const globalVersion = installedDir ? await readPackageVersion(installedDir) : null
  const packageDir = globalVersion ? installedDir : null
  const commandPath = await findOnPath('a5-game-context', input.platform, pathValue)
  const shadowedBy =
    commandPath && packageDir && prefix && !(await isIn(commandPath, packageDir, input.platform, prefix))
      ? commandPath
      : null
  return {
    npm,
    node,
    nodeVersion: node ? await runText(input, node, ['--version']) : null,
    prefix,
    packageDir,
    globalVersion,
    commandPath,
    shadowedBy,
    cocosCliPath: await findOnPath('cocos-cli', input.platform, pathValue),
    sdkRegistered: await sdkRegistered(input.contextHome),
    otherCopies: await findOtherCopies(input, { prefix, packageDir })
  }
}
