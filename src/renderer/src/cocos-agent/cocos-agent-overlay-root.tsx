import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CocosStopAllDialogHost } from './CocosStopAllDialog'
import { cocosAgentApi } from './cocos-workspace-project'

const ROOT_ID = 'cocos-agent-overlay-root'

/**
 * cocos-agent's own dialogs (Stop all Cocos services) on a root of their own, so no upstream component has to host
 * them. Translations fall back to the module functions outside I18nProvider, and theme tokens are global CSS.
 */
export function mountCocosAgentOverlay(): void {
  if (!cocosAgentApi() || document.getElementById(ROOT_ID)) {
    return
  }
  const container = document.createElement('div')
  container.id = ROOT_ID
  document.body.appendChild(container)
  createRoot(container).render(
    <TooltipProvider>
      <CocosStopAllDialogHost />
    </TooltipProvider>
  )
}
