import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ProcessResult, ProcessSpec } from '@orca/process-host/process-spec'
import type {
  A5ToolchainFailureCode,
  A5ToolchainStatus
} from '../../shared/cocos-agent/a5-game-context-toolchain-types'
import { quoteStartupArg } from '../../shared/agent-launch/startup/tui-agent-startup-shell'
import { classifyNpmInstallFailure } from './a5-game-context-install-failure'
import {
  probeA5Toolchain,
  readPackageVersion,
  type ToolchainProbe
} from './a5-game-context-toolchain-probe'
import {
  compareVersions,
  deriveToolchainState,
  globalLauncherScript,
  needsInstall,
  readToolchainSettings,
  writeToolchainSettings,
  type ToolchainSettings
} from './a5-game-context-toolchain-state'

const INSTALL_TIMEOUT_MS = 10 * 60_000

export type A5ToolchainDeps = {
  platform: NodeJS.Platform
  packaged: boolean
  /** The app's `Resources`, holding the bundled package at `a5-game-context/`. */
  resourcesPath: string | undefined
  /** Where the settings, the install log and the launcher go. */
  userData: string
  home: string
  contextHome: () => string
  loginEnv: () => Promise<NodeJS.ProcessEnv>
  run: (spec: ProcessSpec) => Promise<ProcessResult>
  /** Removes what cocos-agent 0.1.2 and earlier registered itself (its PATH links or Windows PATH entry). */
  removeLegacyRegistration: () => Promise<void>
  writeExecutable: (file: string, content: string) => Promise<void>
  emit: (status: A5ToolchainStatus) => void
}

/**
 * Keeps one a5-game-context on the machine: the npm global install. Each launch it checks that copy against the one
 * this app ships and, when it is missing or older, installs the bundled folder with npm (offline, never downgrading).
 */
export class A5GameContextToolchain {
  private status: A5ToolchainStatus
  private probe: ToolchainProbe | null = null
  private env: NodeJS.ProcessEnv = {}
  private work: Promise<unknown> = Promise.resolve()
  private settings: ToolchainSettings | null = null
  private bundledVersion: string | null = null

  constructor(private readonly deps: A5ToolchainDeps) {
    this.status = {
      state: 'checking',
      bundledVersion: null,
      globalVersion: null,
      commandPath: null,
      cocosCliPath: null,
      npmPrefix: null,
      nodeVersion: null,
      sdkRegistered: false,
      usingBundled: true,
      autoInstall: true,
      shadowedBy: null,
      otherCopies: [],
      failure: null,
      manualCommand: null,
      logPath: null
    }
  }

  getStatus(): A5ToolchainStatus {
    return this.status
  }

  private get bundledDir(): string | null {
    return this.deps.packaged && this.deps.resourcesPath
      ? path.join(this.deps.resourcesPath, 'a5-game-context')
      : null
  }

  private get settingsPath(): string {
    return path.join(this.deps.userData, 'cocos-agent', 'a5-game-context-toolchain.json')
  }

  private get logPath(): string {
    return path.join(this.deps.userData, 'logs', 'a5-game-context-install.log')
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.work.then(operation)
    this.work = result.catch(() => undefined)
    return result
  }

  private async readSettings(): Promise<ToolchainSettings> {
    this.settings ??= await readToolchainSettings(this.settingsPath)
    return this.settings
  }

  private async saveSettings(next: ToolchainSettings): Promise<void> {
    this.settings = next
    await writeToolchainSettings(this.settingsPath, next)
  }

  private manualCommand(code: A5ToolchainFailureCode | null): string | null {
    const folder = this.bundledDir
    if (!folder) {
      return null
    }
    const shell = this.deps.platform === 'win32' ? 'cmd' : 'posix'
    const sudo = code === 'permission' && this.deps.platform !== 'win32' ? 'sudo ' : ''
    return `${sudo}npm install -g --install-links --offline ${quoteStartupArg(folder, shell)}`
  }

  private publish(next: Partial<A5ToolchainStatus>): void {
    this.status = { ...this.status, ...next }
    this.deps.emit(this.status)
  }

  private async check(): Promise<void> {
    const settings = await this.readSettings()
    const folder = this.bundledDir
    this.bundledVersion = folder ? await readPackageVersion(folder) : null
    if (!this.bundledVersion) {
      this.probe = null
      this.publish({ state: 'unavailable', usingBundled: true, autoInstall: settings.autoInstall })
      return
    }
    this.env = await this.deps.loginEnv()
    const probe = await probeA5Toolchain({
      platform: this.deps.platform,
      env: this.env,
      home: this.deps.home,
      contextHome: this.deps.contextHome(),
      run: this.deps.run
    })
    this.probe = probe
    let state = deriveToolchainState(probe, this.bundledVersion)
    const failure =
      settings.failure?.bundledVersion === this.bundledVersion && needsInstall(state)
        ? { code: settings.failure.code, detail: settings.failure.detail }
        : null
    if (failure) {
      state = 'failed'
    }
    this.publish({
      state,
      bundledVersion: this.bundledVersion,
      globalVersion: probe.globalVersion,
      commandPath: probe.commandPath,
      cocosCliPath: probe.cocosCliPath,
      npmPrefix: probe.prefix,
      nodeVersion: probe.nodeVersion,
      sdkRegistered: probe.sdkRegistered,
      usingBundled: state !== 'ready',
      autoInstall: settings.autoInstall,
      shadowedBy: probe.shadowedBy,
      otherCopies: probe.otherCopies,
      failure,
      manualCommand: state === 'ready' ? null : this.manualCommand(failure?.code ?? null),
      logPath: this.logPath
    })
  }

  private async writeLog(command: string, result: ProcessResult): Promise<void> {
    await mkdir(path.dirname(this.logPath), { recursive: true })
    await writeFile(
      this.logPath,
      [
        `${new Date().toISOString()} ${command}`,
        `exit: ${String(result.code)}${result.timedOut ? ' (timed out)' : ''}`,
        '--- stdout ---',
        result.stdout,
        '--- stderr ---',
        result.stderr,
        ''
      ].join('\n')
    )
  }

  private async runInstall(reinstallBundled: boolean): Promise<void> {
    if (!this.probe) {
      await this.check()
    }
    const probe = this.probe
    const folder = this.bundledDir
    const bundledVersion = this.bundledVersion
    if (!probe?.npm || !folder || !bundledVersion) {
      return
    }
    const state = deriveToolchainState(probe, bundledVersion)
    if (!reinstallBundled && !needsInstall(state)) {
      return
    }
    this.publish({ state: 'installing' })
    const newerIncomplete =
      state === 'incomplete' &&
      probe.globalVersion !== null &&
      compareVersions(probe.globalVersion, bundledVersion) > 0
    // Why: a newer global copy whose install script was skipped only needs that script, not a downgrade.
    const spec: ProcessSpec =
      newerIncomplete && !reinstallBundled && probe.node && probe.packageDir && probe.prefix
        ? {
            program: probe.node,
            args: [path.join(probe.packageDir, 'scripts', 'install-cocos-cli-bin.cjs')],
            env: {
              ...this.env,
              npm_config_global: 'true',
              npm_config_prefix: probe.prefix
            },
            timeoutMs: INSTALL_TIMEOUT_MS
          }
        : {
            program: probe.npm,
            args: [
              'install',
              '-g',
              '--install-links',
              '--offline',
              '--no-audit',
              '--no-fund',
              '--ignore-scripts=false',
              folder
            ],
            env: { ...this.env, npm_config_update_notifier: 'false' },
            timeoutMs: INSTALL_TIMEOUT_MS
          }
    let result: ProcessResult
    try {
      result = await this.deps.run(spec)
    } catch (error) {
      result = {
        code: null,
        signal: null,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        timedOut: false
      }
    }
    await this.writeLog([spec.program, ...(spec.args ?? [])].join(' '), result).catch(() => {})
    const settings = await this.readSettings()
    if (result.code === 0 && !result.timedOut) {
      await this.saveSettings({ autoInstall: settings.autoInstall })
    } else {
      const failure = classifyNpmInstallFailure(
        this.deps.platform,
        `${result.stdout}\n${result.stderr}`,
        result.timedOut
      )
      await this.saveSettings({ ...settings, failure: { bundledVersion, ...failure } })
    }
    await this.check()
  }

  /** Each packaged launch: drop the old self-registration, check, and install when needed and allowed. */
  syncOnLaunch(): Promise<A5ToolchainStatus> {
    return this.enqueue(async () => {
      if (this.deps.packaged) {
        await this.deps.removeLegacyRegistration().catch((error: unknown) => {
          console.warn('[cocos-agent] could not remove the old a5-game-context registration', error)
        })
      }
      await this.check()
      const settings = await this.readSettings()
      // Why: a failed install is not retried each launch, except files that were in use (Windows) may be free now.
      const retry = this.status.state === 'failed' && this.status.failure?.code === 'busy'
      if (settings.autoInstall && (needsInstall(this.status.state) || retry)) {
        await this.runInstall(false)
      }
      return this.status
    })
  }

  refresh(): Promise<A5ToolchainStatus> {
    return this.enqueue(async () => {
      await this.check()
      return this.status
    })
  }

  install(options: { reinstallBundled?: boolean } = {}): Promise<A5ToolchainStatus> {
    return this.enqueue(async () => {
      await this.check()
      await this.runInstall(options.reinstallBundled === true)
      return this.status
    })
  }

  setAutoInstall(enabled: boolean): Promise<A5ToolchainStatus> {
    return this.enqueue(async () => {
      const settings = await this.readSettings()
      await this.saveSettings({ ...settings, autoInstall: enabled })
      this.publish({ autoInstall: enabled })
      return this.status
    })
  }

  /** The program cocos-agent runs for the global copy once it is ready; null keeps the bundled one. */
  async launcher(): Promise<string | null> {
    await this.work
    const probe = this.probe
    if (this.status.state !== 'ready' || !probe?.packageDir || !probe.prefix) {
      return null
    }
    if (this.deps.platform === 'win32') {
      return path.join(probe.prefix, 'a5-game-context.cmd')
    }
    if (!probe.node) {
      return null
    }
    const launcher = path.join(this.deps.userData, 'cocos-editor-runtime', 'a5-game-context-global')
    await this.deps.writeExecutable(launcher, globalLauncherScript(probe.node, probe.packageDir))
    return launcher
  }
}
