import { toast } from 'sonner'
import type {
  A5ToolchainState,
  A5ToolchainStatus
} from '../../../shared/cocos-agent/a5-game-context-toolchain-types'
import { useAppStore } from '@/store'
import { cocosText } from './cocos-text'
import { cocosAgentApi } from './cocos-workspace-project'
import { toolchainFailureReason } from './a5-game-context-toolchain-copy'

const TOAST_ID = 'cocos-agent-a5-game-context'
/** States worth one notice per bundled version, not one per launch. */
const ONCE_PER_VERSION: readonly A5ToolchainState[] = ['no-npm', 'incompatible']

export function openCocosToolchainSettings(): void {
  const { openSettingsPage, openSettingsTarget } = useAppStore.getState()
  openSettingsPage()
  openSettingsTarget({ pane: 'general', repoId: null, sectionId: 'cocos-toolchain' })
}

function seenOnce(key: string): boolean {
  try {
    if (window.localStorage.getItem(key)) {
      return true
    }
    window.localStorage.setItem(key, '1')
  } catch {
    // Storage can be unavailable; the notice then shows each launch.
  }
  return false
}

const details = (): { action: { label: string; onClick: () => void } } => ({
  action: {
    label: cocosText('toolchain.notice.details', 'Details'),
    onClick: openCocosToolchainSettings
  }
})

function notify(previous: A5ToolchainState | null, status: A5ToolchainStatus): void {
  const version = status.bundledVersion ?? ''
  if (status.state === 'installing') {
    toast.loading(
      cocosText('toolchain.notice.installing', 'Installing a5-game-context {{version}}', {
        version
      }),
      {
        id: TOAST_ID,
        description: cocosText(
          'toolchain.notice.installingDescription',
          'cocos-agent installs the version it ships with npm, for every terminal and agent.'
        )
      }
    )
    return
  }
  if (previous !== 'installing') {
    if (
      ONCE_PER_VERSION.includes(status.state) &&
      !seenOnce(`cocos-agent:toolchain-notice:${status.state}:${version}`)
    ) {
      toast.warning(
        status.state === 'no-npm'
          ? cocosText('toolchain.notice.noNpm', 'npm was not found')
          : cocosText(
              'toolchain.notice.incompatible',
              'a5-game-context {{version}} does not fit this cocos-agent',
              { version: status.globalVersion ?? '' }
            ),
        {
          description:
            status.state === 'no-npm'
              ? cocosText(
                  'toolchain.notice.noNpmDescription',
                  'cocos-agent uses the a5-game-context {{version}} it ships. Install Node.js to share one copy with your terminals.',
                  { version }
                )
              : cocosText(
                  'toolchain.notice.incompatibleDescription',
                  'cocos-agent uses the {{version}} it ships until you update cocos-agent.',
                  { version }
                ),
          ...details()
        }
      )
    }
    return
  }
  if (status.state === 'ready') {
    toast.success(
      cocosText('toolchain.notice.ready', 'a5-game-context {{version}} is ready', {
        version: status.globalVersion ?? version
      }),
      {
        id: TOAST_ID,
        description: cocosText(
          'toolchain.notice.readyDescription',
          'Terminals, Claude, Codex and cocos-agent now use the same version.'
        )
      }
    )
    return
  }
  toast.error(cocosText('toolchain.notice.failed', 'Could not install a5-game-context'), {
    id: TOAST_ID,
    description: status.failure ? toolchainFailureReason(status.failure.code) : undefined,
    ...details()
  })
}

/** Tells the user what the launch install did: progress, the result, and a way to the settings when it failed. */
export function installToolchainNotices(): void {
  const api = cocosAgentApi()
  if (!api) {
    return
  }
  let previous: A5ToolchainState | null = null
  const handle = (status: A5ToolchainStatus): void => {
    if (status.state !== previous) {
      notify(previous, status)
      previous = status.state
    }
  }
  api.onToolchainStatus(handle)
  void api
    .getToolchainStatus()
    .then((status) => {
      if (previous === null) {
        handle(status)
      }
    })
    .catch(() => undefined)
}
