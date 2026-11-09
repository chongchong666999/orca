import type { ComponentProps } from 'react'
import type { BrowserPageToolbar } from '@/components/browser-pane/assemble-chrome/browser-page-toolbar'

/** Stands in for the browser toolbar on Cocos editor pages: same props, nothing rendered. */
export function HiddenBrowserPageToolbar(_props: ComponentProps<typeof BrowserPageToolbar>): null {
  return null
}
