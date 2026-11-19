import { useEffect, useSyncExternalStore } from 'react'
import { Gamepad2, Square } from 'lucide-react'
import type { TabBarCreateRowItem } from '@/components/tab-bar/create-menu/tab-bar-create-row-item'
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

export function useCocosEditorCreateItems(
  worktreeId: string,
  terminalOnly: boolean
): TabBarCreateRowItem[] {
  useUiLanguageRevision()
  const enabled = Boolean(cocosAgentApi()) && !terminalOnly
  const projectPath = useAppStore((state) =>
    enabled ? localCocosWorkspacePath(state, worktreeId) : null
  )
  const detection = useSyncExternalStore(subscribeCocosDetection, () =>
    projectPath ? getCachedCocosDetection(projectPath) : undefined
  )
  const hasEditorTab = useAppStore((state) => enabled && hasCocosEditorTab(state, worktreeId))
  // Why: only an editor this session opened has a record the main process can stop.
  const hasLiveEditorTab = useAppStore(
    (state) => enabled && findCocosEditorTabId(state, worktreeId) !== null
  )
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
    return []
  }
  const items: TabBarCreateRowItem[] = [
    {
      id: 'cocos-editor',
      label: hasEditorTab
        ? cocosText('editor.menu.goTo', 'Go to Cocos Creator')
        : cocosText('editor.menu.open', 'Cocos Creator'),
      icon: <Gamepad2 className="size-4" />,
      run: () => void focusOrOpenCocosEditor(worktreeId, projectPath)
    }
  ]
  if (hasLiveEditorTab) {
    items.push({
      id: 'cocos-editor-stop',
      label: cocosText('editor.menu.stop', 'Stop Cocos Creator'),
      icon: <Square className="size-4" />,
      run: () => void stopCocosEditor(worktreeId, projectPath)
    })
  }
  return items
}
