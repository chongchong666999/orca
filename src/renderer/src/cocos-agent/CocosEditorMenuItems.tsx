import React, { useEffect, useSyncExternalStore } from 'react'
import { Gamepad2, Square } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
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

const MENU_ITEM_CLASS = 'gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium'

/** The + menu's Cocos Creator entries, shown only in local Cocos Creator 2.x workspaces of the desktop app. */
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
    return null
  }
  return (
    <>
      <DropdownMenuItem
        onSelect={() => void focusOrOpenCocosEditor(worktreeId, projectPath)}
        className={MENU_ITEM_CLASS}
      >
        <Gamepad2 className="size-4 text-muted-foreground" />
        {hasEditorTab
          ? cocosText('editor.menu.goTo', 'Go to Cocos Creator')
          : cocosText('editor.menu.open', 'Cocos Creator')}
      </DropdownMenuItem>
      {hasLiveEditorTab ? (
        <DropdownMenuItem
          onSelect={() => void stopCocosEditor(worktreeId, projectPath)}
          className={MENU_ITEM_CLASS}
        >
          <Square className="size-4 text-muted-foreground" />
          {cocosText('editor.menu.stop', 'Stop Cocos Creator')}
        </DropdownMenuItem>
      ) : null}
    </>
  )
}
