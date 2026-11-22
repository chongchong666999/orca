/**
 * The global a5-game-context (and its cocos-cli) every terminal, agent and cocos-agent itself use: one npm global
 * install, seeded from the copy cocos-agent ships (docs/cocos-agent/creator-preview-port-and-npm-install-2026-11-21.md).
 */
export type A5ToolchainState =
  | 'checking'
  | 'installing'
  /** The global copy is the bundled version or a newer one of the same major, with cocos-cli and the SDK. */
  | 'ready'
  /** No global copy; automatic install is off or has not run. */
  | 'missing'
  /** The global copy is older than the bundled one; automatic install is off or has not run. */
  | 'outdated'
  /** The version is right but cocos-cli or the Cocos SDK is missing (its install script was skipped). */
  | 'incomplete'
  /** Another major version: cocos-agent neither runs it nor replaces it. */
  | 'incompatible'
  | 'failed'
  /** No npm on the login PATH: cocos-agent runs its bundled copy itself. */
  | 'no-npm'
  /** Development builds and builds without the bundled package. */
  | 'unavailable'

export type A5ToolchainFailureCode = 'permission' | 'busy' | 'no-space' | 'timed-out' | 'unknown'

export type A5ToolchainOtherCopy = {
  /** `package`: an npm global install under another prefix; `link`: a command link into something else. */
  kind: 'package' | 'link'
  version: string | null
  location: string
  /** Shell command that removes it; shown for copying, never run by cocos-agent. */
  removeCommand: string
}

export type A5ToolchainStatus = {
  state: A5ToolchainState
  bundledVersion: string | null
  globalVersion: string | null
  /** The a5-game-context the login PATH finds first. */
  commandPath: string | null
  cocosCliPath: string | null
  npmPrefix: string | null
  nodeVersion: string | null
  sdkRegistered: boolean
  /** cocos-agent's own editor and MCP run the bundled copy, because the global one is not usable. */
  usingBundled: boolean
  autoInstall: boolean
  /** A copy PATH finds before the npm global one, when they differ. */
  shadowedBy: string | null
  otherCopies: A5ToolchainOtherCopy[]
  failure: { code: A5ToolchainFailureCode; detail: string } | null
  /** Installs the bundled version by hand (with sudo when npm's global folder needs it). */
  manualCommand: string | null
  logPath: string | null
}

export type A5ToolchainPreloadApi = {
  getToolchainStatus: () => Promise<A5ToolchainStatus>
  refreshToolchain: () => Promise<A5ToolchainStatus>
  /** `reinstallBundled`: install the bundled version even over a newer global one (asks first in the UI). */
  installToolchain: (options?: { reinstallBundled?: boolean }) => Promise<A5ToolchainStatus>
  setToolchainAutoInstall: (enabled: boolean) => Promise<A5ToolchainStatus>
  openToolchainLog: () => Promise<void>
  onToolchainStatus: (listener: (status: A5ToolchainStatus) => void) => () => void
}

export const A5_TOOLCHAIN_IPC = {
  getStatus: 'cocos-agent:toolchain-status',
  refresh: 'cocos-agent:toolchain-refresh',
  install: 'cocos-agent:toolchain-install',
  setAutoInstall: 'cocos-agent:toolchain-auto-install',
  openLog: 'cocos-agent:toolchain-open-log',
  statusChanged: 'cocos-agent:toolchain-status-changed'
} as const
