import { TerminalSquare } from 'lucide-react'
import type { ActivityBarItem } from '@/components/right-sidebar/activity-bar/activity-bar-buttons'
import { cocosText } from './cocos-text'
import { cocosAgentApi } from './cocos-workspace-project'

export function cocosSidebarActivityItems(): ActivityBarItem[] {
  return cocosAgentApi()
    ? [
        {
          id: 'terminal',
          icon: TerminalSquare,
          title: cocosText('sidebar.terminal.title', 'Terminal'),
          shortcut: ''
        }
      ]
    : []
}
