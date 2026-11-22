import { useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import type { CocosRunningService } from '../../../shared/cocos-agent/cocos-editor-types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import { cocosText } from './cocos-text'
import { focusOrOpenCocosEditor, handOffCocosEditors } from './cocos-editor-tabs'
import { cocosAgentApi, localCocosWorkspacePath } from './cocos-workspace-project'

let open = false
const listeners = new Set<() => void>()

function setOpen(next: boolean): void {
  open = next
  listeners.forEach((listener) => listener())
}

/** The + menu's "Stop all Cocos services…": the confirmation lists every service before anything stops. */
export function openCocosStopAllDialog(): void {
  setOpen(true)
}

function useDialogOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => open,
    () => false
  )
}

function projectName(projectRoot: string): string {
  return projectRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? projectRoot
}

function displayPath(projectRoot: string): string {
  const home = /^(\/Users\/[^/]+|\/home\/[^/]+)(?=\/)/.exec(projectRoot)?.[1]
  return home ? `~${projectRoot.slice(home.length)}` : projectRoot
}

function ServiceRow({ service }: { service: CocosRunningService }): React.JSX.Element {
  return (
    <li className="flex gap-3 px-3.5 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{projectName(service.projectRoot)}</span>
          <span className="rounded-full border px-2 text-2xs whitespace-nowrap text-muted-foreground">
            {service.origin === 'app'
              ? cocosText('editor.stopAll.openedByApp', 'Opened by cocos-agent')
              : cocosText('editor.stopAll.openedElsewhere', 'Opened by an agent or the CLI')}
          </span>
        </div>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {displayPath(service.projectRoot)}
        </span>
        {service.unsavedDocuments > 0 ? (
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <span aria-hidden className="size-1.5 rounded-full bg-foreground" />
            {cocosText('editor.stopAll.unsaved', '{{count}} unsaved documents', {
              count: service.unsavedDocuments
            })}
          </span>
        ) : null}
      </div>
      {service.previewPort ? (
        <span className="shrink-0 pt-0.5 font-mono text-xs whitespace-nowrap text-muted-foreground">
          {cocosText('editor.stopAll.previewPort', 'Preview :{{port}}', {
            port: service.previewPort
          })}
        </span>
      ) : null}
    </li>
  )
}

/** The active workspace's project, when Stop all stopped its editor: the toast offers to reopen it. */
function reopenTarget(stoppedRoots: string[]): { worktreeId: string; projectPath: string } | null {
  const state = useAppStore.getState()
  const worktreeId = state.activeWorktreeId
  const projectPath = worktreeId ? localCocosWorkspacePath(state, worktreeId) : null
  if (!worktreeId || !projectPath) {
    return null
  }
  const normalize = (value: string): string => value.replaceAll('\\', '/').replace(/\/+$/, '')
  const project = normalize(projectPath)
  const inside = stoppedRoots.map(normalize).some(
    (root) => project === root || project.startsWith(`${root}/`) || root.startsWith(`${project}/`)
  )
  return inside ? { worktreeId, projectPath } : null
}

export function CocosStopAllDialogHost(): React.JSX.Element | null {
  const isOpen = useDialogOpen()
  const [services, setServices] = useState<CocosRunningService[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setServices(null)
      return
    }
    let cancelled = false
    void (cocosAgentApi()?.listServices() ?? Promise.resolve([]))
      .catch(() => [])
      .then((list) => {
        if (!cancelled) {
          setServices(list)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  const api = cocosAgentApi()
  if (!api) {
    return null
  }
  const hasUnsaved = (services ?? []).some((service) => service.unsavedDocuments > 0)

  const stop = async (preset?: 'save' | 'discard'): Promise<void> => {
    setBusy(true)
    try {
      const result = await api.stopAllServices(preset)
      handOffCocosEditors(result.stopped)
      setOpen(false)
      if (result.stopped.length > 0) {
        const target = reopenTarget(result.stopped.map((record) => record.projectRoot))
        toast.success(
          cocosText('editor.stopAll.done', 'Stopped {{count}} Cocos services', {
            count: result.stopped.length
          }),
          {
            description: cocosText(
              'editor.stopAll.doneDescription',
              'Asset sync and preview ports are released. Cocos Creator needs no restart.'
            ),
            ...(target
              ? {
                  action: {
                    label: cocosText('editor.stopAll.reopen', 'Reopen {{name}}', {
                      name: projectName(target.projectPath)
                    }),
                    onClick: () => void focusOrOpenCocosEditor(target.worktreeId, target.projectPath)
                  }
                }
              : {})
          }
        )
      }
      if (result.failed.length > 0) {
        toast.warning(
          cocosText('editor.stopAll.partial', '{{count}} Cocos services did not stop', {
            count: result.failed.length
          }),
          { description: result.failed.map((failure) => projectName(failure.projectRoot)).join(', ') }
        )
      }
    } catch (error) {
      toast.error(cocosText('editor.stopAll.failed', 'Could not stop the Cocos services'), {
        description: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogContent size="list">
        <DialogHeader>
          <DialogTitle>{cocosText('editor.stopAll.title', 'Stop all Cocos services?')}</DialogTitle>
          <DialogDescription>
            {cocosText(
              'editor.stopAll.description',
              'cocos-agent stops syncing these projects’ assets and .meta files and releases their preview ports. Cocos Creator can take over right away, no restart needed.'
            )}
          </DialogDescription>
        </DialogHeader>
        {services === null ? (
          <p className="text-sm text-muted-foreground">
            {cocosText('editor.stopAll.loading', 'Looking for running services…')}
          </p>
        ) : services.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {cocosText('editor.stopAll.none', 'No Cocos services are running.')}
          </p>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {services.map((service) => (
                <ServiceRow key={service.url} service={service} />
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {cocosText(
                'editor.stopAll.note',
                'Services opened by agent sessions stop too; those sessions reopen the project before using editor tools again. The sessions and their MCP servers keep running.'
              )}
            </p>
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            {cocosText('editor.close.cancel', 'Cancel')}
          </Button>
          {services && services.length > 0 ? (
            hasUnsaved ? (
              <>
                <Button variant="outline" disabled={busy} onClick={() => void stop('discard')}>
                  {cocosText('editor.stopAll.discard', 'Stop without saving')}
                </Button>
                <Button disabled={busy} onClick={() => void stop('save')}>
                  {cocosText('editor.stopAll.save', 'Save and stop')}
                </Button>
              </>
            ) : (
              <Button disabled={busy} onClick={() => void stop()}>
                {cocosText('editor.stopAll.confirm', 'Stop all')}
              </Button>
            )
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
