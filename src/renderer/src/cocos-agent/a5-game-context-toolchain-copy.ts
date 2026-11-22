import type {
  A5ToolchainFailureCode,
  A5ToolchainStatus
} from '../../../shared/cocos-agent/a5-game-context-toolchain-types'
import { cocosText } from './cocos-text'

/** One sentence on why npm failed; npm's own output stays in the install log. */
export function toolchainFailureReason(code: A5ToolchainFailureCode): string {
  switch (code) {
    case 'permission':
      return cocosText(
        'toolchain.failure.permission',
        'npm may not write to its global folder (EACCES). Run the command below in a terminal; it asks for your password.'
      )
    case 'busy':
      return cocosText(
        'toolchain.failure.busy',
        'Files of the old version are still in use. Close the Claude and Codex sessions that use it, stop all Cocos services, then retry.'
      )
    case 'no-space':
      return cocosText(
        'toolchain.failure.noSpace',
        'The disk is full (ENOSPC). Free some space, then retry.'
      )
    case 'timed-out':
      return cocosText('toolchain.failure.timedOut', 'npm did not finish within 10 minutes.')
    case 'unknown':
      return cocosText(
        'toolchain.failure.unknown',
        'npm stopped with an error. See the install log.'
      )
  }
}

/** The status line under "a5-game-context and cocos-cli". */
export function toolchainSummary(status: A5ToolchainStatus): string {
  const bundled = status.bundledVersion ?? ''
  const global = status.globalVersion ?? ''
  switch (status.state) {
    case 'checking':
      return cocosText('toolchain.state.checking', 'Checking…')
    case 'installing':
      return cocosText('toolchain.state.installing', 'Installing {{version}} with npm…', {
        version: bundled
      })
    case 'ready':
      return global === bundled
        ? cocosText(
            'toolchain.state.readySame',
            '{{version}} · npm global · the version cocos-agent ships',
            {
              version: global
            }
          )
        : cocosText(
            'toolchain.state.readyNewer',
            '{{version}} · npm global · newer than the {{bundled}} cocos-agent ships',
            {
              version: global,
              bundled
            }
          )
    case 'missing':
      return cocosText(
        'toolchain.state.missing',
        'Not installed · cocos-agent uses the {{version}} it ships',
        {
          version: bundled
        }
      )
    case 'outdated':
      return cocosText(
        'toolchain.state.outdated',
        '{{version}} installed · {{bundled}} is available',
        {
          version: global,
          bundled
        }
      )
    case 'incomplete':
      return cocosText(
        'toolchain.state.incomplete',
        '{{version}} · cocos-cli or the Cocos SDK is missing',
        {
          version: global
        }
      )
    case 'incompatible':
      return cocosText(
        'toolchain.state.incompatible',
        '{{version}} does not fit this cocos-agent · it uses the {{bundled}} it ships',
        {
          version: global,
          bundled
        }
      )
    case 'failed':
      return cocosText(
        'toolchain.state.failed',
        'Installing {{bundled}} failed · cocos-agent uses the {{bundled}} it ships',
        {
          bundled
        }
      )
    case 'no-npm':
      return cocosText(
        'toolchain.state.noNpm',
        'npm not found · cocos-agent uses the {{version}} it ships',
        {
          version: bundled
        }
      )
    case 'unavailable':
      return cocosText('toolchain.state.unavailable', 'Not available in this build')
  }
}
