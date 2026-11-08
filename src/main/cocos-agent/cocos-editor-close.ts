import { BrowserWindow, dialog, webContents, type MessageBoxOptions } from 'electron'
import type { CocosEditorRecord } from '../../shared/cocos-agent/cocos-editor-types'
import { z } from 'zod'
import { translateMain } from '../i18n/main-i18n'
import { editorShutdownUrl } from './cocos-editor-open-output'

export type CocosEditorCloseChoice =
  | { action: 'save' | 'discard'; revision: string }
  | { action: 'keep' }

async function message(options: MessageBoxOptions): Promise<number> {
  const window = BrowserWindow.getFocusedWindow()
  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options)
  return result.response
}

async function flushPages(pageUrl: string): Promise<void> {
  const editor = new URL(pageUrl)
  const pages = webContents.getAllWebContents().filter((contents) => {
    if (contents.isDestroyed()) {
      return false
    }
    try {
      const page = new URL(contents.getURL())
      return (
        page.origin === editor.origin &&
        page.pathname === '/' &&
        page.searchParams.get('token') === editor.searchParams.get('token')
      )
    } catch {
      return false
    }
  })
  await Promise.all(
    pages.map(async (page) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          page.executeJavaScript(
            '(async () => { if (!window.__a5Editor?.flushForClose) throw new Error("Editor is not ready. Wait for it to load before closing."); await window.__a5Editor.flushForClose(); })()'
          ),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error('The editor did not finish its pending edits. Try again.')),
              12_000
            )
          })
        ])
      } finally {
        clearTimeout(timer)
      }
    })
  )
}

export async function prepareCocosEditorClose(
  record: CocosEditorRecord,
  forQuit = false
): Promise<CocosEditorCloseChoice | false | undefined> {
  try {
    await flushPages(record.url)
    const shutdown = editorShutdownUrl(record.url)
    if (!shutdown) {
      throw new Error('Invalid editor address')
    }
    const url = new URL(shutdown)
    url.pathname = '/editor/lifecycle'
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000), redirect: 'error' })
    if (!response.ok) {
      throw new Error('Could not check unsaved editor changes.')
    }
    const state = z
      .object({
        closeSupported: z.number().optional(),
        dirty: z.boolean().optional(),
        busy: z.boolean().optional(),
        revision: z.string().optional(),
        documents: z
          .array(z.object({ path: z.string().optional(), dirty: z.boolean().optional() }))
          .optional()
      })
      .parse(await response.json())
    if (state.closeSupported !== 1 || typeof state.revision !== 'string') {
      if (state.busy) {
        throw new Error('Wait for the editor to finish its current operation before closing.')
      }
      throw new Error('This editor service needs to be updated. Save changes before restarting it.')
    }
    if (state.dirty === false) {
      return undefined
    }
    if (state.dirty !== true) {
      throw new Error('Could not check unsaved editor changes.')
    }
    const choice = await message({
      type: 'warning',
      noLink: true,
      defaultId: 0,
      cancelId: 1,
      title: 'Cocos Creator',
      message: translateMain('cocosEditor.close.message', 'Save editor changes before closing?'),
      detail: [
        record.projectRoot,
        ...(state.documents ?? []).filter((doc) => doc.dirty).map((doc) => doc.path ?? '')
      ].join('\n'),
      buttons: [
        translateMain('cocosEditor.close.save', 'Save'),
        translateMain('common.cancel', 'Cancel'),
        translateMain('cocosEditor.close.discard', "Don't Save")
      ]
    })
    if (choice !== 0 && choice !== 2) {
      return false
    }
    await flushPages(record.url)
    return { action: choice === 0 ? 'save' : 'discard', revision: state.revision }
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ECONNREFUSED') {
      return undefined
    }
    if (
      await reportCocosEditorCloseFailure(
        error instanceof Error ? error.message : String(error),
        forQuit
      )
    ) {
      return { action: 'keep' }
    }
    return false
  }
}

export async function reportCocosEditorCloseFailure(
  detail: string,
  forQuit = false
): Promise<boolean> {
  const choice = await message({
    type: 'error',
    title: 'Cocos Creator',
    message: translateMain(
      'cocosEditor.close.failed',
      'Could not confirm that the editor has closed. Check its status before trying again.'
    ),
    detail: forQuit
      ? `${translateMain('cocosEditor.close.keepWarning', 'Keeping the service does not save pending page edits. Return to the editor if you need to preserve those edits.')}\n\n${detail}`
      : detail,
    buttons: forQuit
      ? [
          translateMain('common.cancel', 'Cancel'),
          translateMain('cocosEditor.close.keepService', 'Quit App and Keep Editor Service')
        ]
      : [translateMain('common.ok', 'OK')],
    defaultId: 0,
    cancelId: 0
  })
  return forQuit && choice === 1
}

export function describeCocosEditorCloseFailure(closing: boolean): string {
  return closing
    ? translateMain(
        'cocosEditor.close.stillClosing',
        'The service accepted the close request but has not finished exiting.'
      )
    : translateMain(
        'cocosEditor.close.unconfirmed',
        'The close request could not be confirmed. Check for save conflicts or a busy editor.'
      )
}
