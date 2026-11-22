import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { Gamepad2, Power, Square } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { openCocosStopAllDialog } from './CocosStopAllDialog'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { cocosText } from './cocos-text'
import { useAppStore } from '@/store'
import {
  cocosAgentApi,
  detectCocosProject,
  getCachedCocosDetection,
  isSupportedCreatorVersion,
  localCocosWorkspacePath,
  subscribeCocosDetection
} from './cocos-workspace-project'
import {
  findCocosEditorTabId,
  focusOrOpenCocosEditor,
  hasCocosEditorTab,
  stopCocosEditor
} from './cocos-editor-tabs'

/**
 * The + menu's labeled Cocos Creator entries, shown only in local Cocos Creator 2.x workspaces of
 * the desktop app. Kept out of upstream's icon row so a customizer toggle can never hide them.
 */
export function CocosEditorMenuItems({
  worktreeId,
  terminalOnly
}: {
  worktreeId: string
  terminalOnly: boolean
}): React.ReactNode {
  // Why: the web client and tests have no preload API (or full store), so the workspace reads below never run there.
  return cocosAgentApi() && !terminalOnly ? (
    <CocosEditorMenuItemsForWorkspace worktreeId={worktreeId} />
  ) : null
}

function CocosEditorMenuItemsForWorkspace({ worktreeId }: { worktreeId: string }): React.ReactNode {
  useUiLanguageRevision()
  const projectPath = useAppStore((state) => localCocosWorkspacePath(state, worktreeId))
  const detection = useSyncExternalStore(subscribeCocosDetection, () =>
    projectPath ? getCachedCocosDetection(projectPath) : undefined
  )
  const hasEditorTab = useAppStore((state) => hasCocosEditorTab(state, worktreeId))
  // Why: only an editor this session opened has a record the main process can stop.
  const hasLiveEditorTab = useAppStore((state) => findCocosEditorTabId(state, worktreeId) !== null)
  useEffect(() => {
    if (projectPath) {
      void detectCocosProject(projectPath)
    }
  }, [projectPath])

  if (
    !projectPath ||
    detection?.kind !== 'cocos' ||
    !isSupportedCreatorVersion(detection.creatorVersion)
  ) {
    return <StopAllCocosServicesItem />
  }
  return (
    <>
      <DropdownMenuItem
        variant="create"
        onSelect={() => void focusOrOpenCocosEditor(worktreeId, projectPath)}
      >
        <Gamepad2 className="size-4 text-muted-foreground" />
        {hasEditorTab
          ? cocosText('editor.menu.goTo', 'Go to Cocos Creator')
          : cocosText('editor.menu.open', 'Cocos Creator')}
      </DropdownMenuItem>
      {hasLiveEditorTab ? (
        <DropdownMenuItem
          variant="create"
          onSelect={() => void stopCocosEditor(worktreeId, projectPath)}
        >
          <Square className="size-4 text-muted-foreground" />
          {cocosText('editor.menu.stop', 'Stop Cocos Creator')}
        </DropdownMenuItem>
      ) : null}
      <StopAllCocosServicesItem />
    </>
  )
}

/** Shown while any editor service runs, in every workspace: hands all projects back to Cocos Creator. */
function StopAllCocosServicesItem(): React.ReactNode {
  const [running, setRunning] = useState(0)
  useEffect(() => {
    let cancelled = false
    void cocosAgentApi()
      ?.listServices()
      .then((services) => {
        if (!cancelled) {
          setRunning(services.length)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  if (running === 0) {
    return null
  }
  return (
    <DropdownMenuItem variant="create" onSelect={() => openCocosStopAllDialog()}>
      <Power className="size-4 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        {cocosText('editor.menu.stopAll', 'Stop all Cocos services…')}
      </span>
      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
        {cocosText('editor.menu.running', '{{count}} running', { count: running })}
      </span>
    </DropdownMenuItem>
  )
}
