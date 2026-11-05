import React, { useEffect, useSyncExternalStore } from 'react'
import { Gamepad2, Square } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import {
  cocosAgentApi,
  detectCocosProject,
  getCachedCocosDetection,
  isSupportedCreatorVersion,
  localCocosWorkspacePath,
  subscribeCocosDetection
} from './cocos-workspace-project'
import { findCocosEditorTabId, focusOrOpenCocosEditor, stopCocosEditor } from './cocos-editor-tabs'

const MENU_ITEM_CLASS = 'gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium'

/** The + menu's Cocos Creator entries, shown only in local Cocos Creator 2.x workspaces. */
export function CocosEditorMenuItems({
  worktreeId,
  terminalOnly
}: {
  worktreeId: string
  terminalOnly: boolean
}): React.ReactNode {
  const projectPath = useAppStore((state) => localCocosWorkspacePath(state, worktreeId))
  const detection = useSyncExternalStore(subscribeCocosDetection, () =>
    projectPath ? getCachedCocosDetection(projectPath) : undefined
  )
  const editorTabId = useAppStore((state) => findCocosEditorTabId(state, worktreeId))
  useEffect(() => {
    if (projectPath && cocosAgentApi()) {
      void detectCocosProject(projectPath)
    }
  }, [projectPath])

  if (
    terminalOnly ||
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
        {editorTabId ? 'Go to Cocos Creator' : 'Cocos Creator'}
      </DropdownMenuItem>
      {editorTabId ? (
        <DropdownMenuItem
          onSelect={() => void stopCocosEditor(worktreeId, projectPath)}
          className={MENU_ITEM_CLASS}
        >
          <Square className="size-4 text-muted-foreground" />
          Stop Cocos Creator
        </DropdownMenuItem>
      ) : null}
    </>
  )
}
