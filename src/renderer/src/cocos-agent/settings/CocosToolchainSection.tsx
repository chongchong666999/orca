import { useEffect, useState } from 'react'
import { MoreHorizontal, RefreshCw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { A5ToolchainStatus } from '../../../../shared/cocos-agent/a5-game-context-toolchain-types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SettingsGroup } from '@/components/settings/section-layout/SettingsGroup'
import { SettingsSwitchRow } from '@/components/settings/form-controls/SettingsFormControls'
import { matchesSettingsSearch } from '@/components/settings/search/settings-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { cocosText } from '../cocos-text'
import { cocosAgentApi } from '../cocos-workspace-project'
import { toolchainFailureReason, toolchainSummary } from '../a5-game-context-toolchain-copy'

export const COCOS_TOOLCHAIN_SECTION_ID = 'cocos-toolchain'

const getCocosToolchainSearchEntries = createLocalizedCatalog(() => [
  {
    title: cocosText('toolchain.title', 'Cocos command-line tools'),
    description: cocosText(
      'toolchain.searchDescription',
      'The a5-game-context and cocos-cli every terminal and agent uses, installed with npm.'
    ),
    keywords: ['a5-game-context', 'cocos-cli', 'npm', 'cocos', 'cli'],
    targetSectionId: COCOS_TOOLCHAIN_SECTION_ID
  }
])

const WARNING_STATES = new Set<A5ToolchainStatus['state']>([
  'failed',
  'incompatible',
  'outdated',
  'incomplete',
  'missing',
  'no-npm'
])

function Code({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-2xs break-all">{children}</code>
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(cocosText('toolchain.copied', 'Copied'))
  } catch {
    toast.error(cocosText('toolchain.copyFailed', 'Could not copy to the clipboard'))
  }
}

function installLabel(status: A5ToolchainStatus): string | null {
  const version = status.bundledVersion ?? ''
  switch (status.state) {
    case 'missing':
      return cocosText('toolchain.action.install', 'Install {{version}}', { version })
    case 'outdated':
      return cocosText('toolchain.action.update', 'Update to {{version}}', { version })
    case 'incomplete':
      return cocosText('toolchain.action.repair', 'Repair')
    case 'failed':
      return cocosText('toolchain.action.retry', 'Retry')
    default:
      return null
  }
}

function CocosToolchainSection(): React.JSX.Element | null {
  const api = cocosAgentApi()
  const [status, setStatus] = useState<A5ToolchainStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmReinstall, setConfirmReinstall] = useState(false)

  useEffect(() => {
    if (!api) {
      return
    }
    const unsubscribe = api.onToolchainStatus(setStatus)
    void api.getToolchainStatus().then(setStatus, () => undefined)
    return unsubscribe
  }, [api])

  if (!api || !status || status.state === 'unavailable') {
    return null
  }

  const run = async (action: () => Promise<A5ToolchainStatus>): Promise<void> => {
    setBusy(true)
    try {
      setStatus(await action())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  const working = busy || status.state === 'installing' || status.state === 'checking'
  const manualCommand = status.manualCommand
  const action = installLabel(status)
  const warning = WARNING_STATES.has(status.state)
  const canReinstall =
    status.state !== 'no-npm' && status.bundledVersion !== null && status.globalVersion !== null

  return (
    <div data-settings-section={COCOS_TOOLCHAIN_SECTION_ID}>
      <SettingsGroup title={cocosText('toolchain.title', 'Cocos command-line tools')}>
        <div data-settings-row="" className="space-y-3 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 space-y-0.5">
              <Label>{cocosText('toolchain.commands', 'a5-game-context and cocos-cli')}</Label>
              <p
                className={`text-xs ${warning ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}
              >
                {toolchainSummary(status)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={working}
                      onClick={() => void run(() => api.refreshToolchain())}
                      aria-label={cocosText('toolchain.refresh', 'Check again')}
                    >
                      <RefreshCw className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    {cocosText('toolchain.refresh', 'Check again')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={cocosText('toolchain.more', 'More actions')}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={working || !canReinstall}
                    onSelect={() => setConfirmReinstall(true)}
                  >
                    {cocosText('toolchain.action.reinstall', 'Reinstall the bundled {{version}}', {
                      version: status.bundledVersion ?? ''
                    })}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void api.openToolchainLog()}>
                    {cocosText('toolchain.action.openLog', 'Open the install log')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {action && status.state !== 'failed' ? (
                <Button
                  size="sm"
                  disabled={working}
                  onClick={() => void run(() => api.installToolchain())}
                >
                  {action}
                </Button>
              ) : null}
            </div>
          </div>

          {status.state === 'failed' && status.failure ? (
            <div role="alert" className="space-y-2.5 rounded-lg border bg-muted/40 px-3.5 py-3">
              <div className="flex gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{toolchainFailureReason(status.failure.code)}</p>
                  {status.failure.detail ? (
                    <p className="font-mono text-2xs break-all text-muted-foreground">
                      {status.failure.detail}
                    </p>
                  ) : null}
                </div>
              </div>
              {manualCommand ? (
                <pre className="overflow-x-auto rounded-md border bg-background px-2.5 py-2 font-mono text-xs">
                  {manualCommand}
                </pre>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {manualCommand ? (
                  <Button size="xs" variant="outline" onClick={() => void copy(manualCommand)}>
                    {cocosText('toolchain.action.copyCommand', 'Copy command')}
                  </Button>
                ) : null}
                <Button size="xs" variant="ghost" onClick={() => void api.openToolchainLog()}>
                  {cocosText('toolchain.action.openLog', 'Open the install log')}
                </Button>
                <Button
                  size="xs"
                  disabled={working}
                  onClick={() => void run(() => api.installToolchain())}
                >
                  {cocosText('toolchain.action.retry', 'Retry')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {cocosText(
                  'toolchain.manualHint',
                  'After running the command yourself, use Check again.'
                )}
              </p>
            </div>
          ) : null}

          <div className="space-y-1 text-xs text-muted-foreground">
            {status.commandPath ? (
              <p>
                {cocosText('toolchain.commandPath', 'Command path:')} <Code>{status.commandPath}</Code>
              </p>
            ) : null}
            {status.cocosCliPath ? (
              <p>
                cocos-cli: <Code>{status.cocosCliPath}</Code>
              </p>
            ) : null}
            {status.state !== 'no-npm' ? (
              <p>
                {status.sdkRegistered
                  ? cocosText('toolchain.sdkReady', 'Cocos 2.4.13 SDK registered')
                  : cocosText('toolchain.sdkMissing', 'Cocos 2.4.13 SDK not registered')}
                {status.nodeVersion ? ` · Node ${status.nodeVersion.replace(/^v/, '')}` : ''}
              </p>
            ) : null}
            {status.shadowedBy ? (
              <p className="text-amber-700 dark:text-amber-400">
                {cocosText(
                  'toolchain.shadowed',
                  'Terminals find another copy first. Remove it to use the npm global one:'
                )}{' '}
                <Code>{status.shadowedBy}</Code>
              </p>
            ) : null}
          </div>
        </div>

        <SettingsSwitchRow
          label={cocosText('toolchain.autoInstall', 'Install after cocos-agent updates')}
          description={cocosText(
            'toolchain.autoInstallDescription',
            'Checks on the first launch of each new version and only ever upgrades. When off, cocos-agent only tells you.'
          )}
          checked={status.autoInstall}
          disabled={busy}
          onChange={(enabled) => void run(() => api.setToolchainAutoInstall(enabled))}
        />

        {status.otherCopies.length > 0 ? (
          <div data-settings-row="" className="space-y-2 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label>{cocosText('toolchain.otherCopies', 'Other copies on this machine')}</Label>
                <p className="text-xs text-muted-foreground">
                  {cocosText(
                    'toolchain.otherCopiesDescription',
                    'Not on PATH, so nothing uses them; they only make versions confusing.'
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => void copy(status.otherCopies.map((item) => item.removeCommand).join('\n'))}
              >
                {cocosText('toolchain.action.copyCleanup', 'Copy cleanup commands')}
              </Button>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {status.otherCopies.map((item) => (
                <li key={item.location} className="flex gap-1.5">
                  <span className="text-foreground">{item.version ?? '?'}</span>
                  <span>·</span>
                  <span className="min-w-0 truncate font-mono">{item.location}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </SettingsGroup>

      <Dialog open={confirmReinstall} onOpenChange={setConfirmReinstall}>
        <DialogContent size="confirm">
          <DialogHeader>
            <DialogTitle>
              {cocosText('toolchain.reinstall.title', 'Reinstall a5-game-context {{version}}?', {
                version: status.bundledVersion ?? ''
              })}
            </DialogTitle>
            <DialogDescription>
              {cocosText(
                'toolchain.reinstall.description',
                'This replaces the global {{current}} with the version cocos-agent ships, even if it is older. Use it when the installed copy is broken.',
                { current: status.globalVersion ?? '' }
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmReinstall(false)}>
              {cocosText('editor.close.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={() => {
                setConfirmReinstall(false)
                void run(() => api.installToolchain({ reinstallBundled: true }))
              }}
            >
              {cocosText('toolchain.reinstall.confirm', 'Reinstall')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Settings ▸ General in cocos-agent builds: where upstream's `orca` command registration sits, which they hide. */
export function CocosToolchainSettings({ query }: { query: string }): React.JSX.Element | null {
  useUiLanguageRevision()
  if (!cocosAgentApi() || !matchesSettingsSearch(query, getCocosToolchainSearchEntries())) {
    return null
  }
  return <CocosToolchainSection />
}
