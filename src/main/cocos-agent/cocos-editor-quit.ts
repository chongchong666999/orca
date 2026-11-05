import { app } from 'electron'
import { cocosEditorService } from './cocos-editor-service'

let installed = false

/** On quit, stops the editors this app session started; ones the CLI or an agent started keep running. */
export function stopAppStartedEditorsOnQuit(): void {
  if (installed) {
    return
  }
  installed = true
  let requested = false
  app.on('will-quit', () => {
    // Why: Orca re-fires will-quit after its teardown barrier; the requests go out on the first pass, without delaying it.
    if (requested) {
      return
    }
    requested = true
    cocosEditorService.shutdownForQuit()
  })
}
