import { app } from 'electron'
import { cocosEditorService } from './cocos-editor-service-instance'

let installed = false

/** On quit, stops the editors this app session started; ones the CLI or an agent started keep running. */
export function stopAppStartedEditorsOnQuit(): void {
  if (installed) {
    return
  }
  installed = true
  let preparing = false
  app.prependListener('before-quit', (event) => {
    if (event.defaultPrevented) {
      return
    }
    const owned = cocosEditorService.list().filter((record) => record.startedByApp)
    if (!owned.length) {
      return
    }
    event.preventDefault()
    if (preparing) {
      return
    }
    preparing = true
    void (async () => {
      try {
        for (const record of owned) {
          if (!(await cocosEditorService.stop(record.projectRoot, true))) {
            return
          }
        }
      } finally {
        preparing = false
      }
      app.quit()
    })().catch((error) => console.error('Could not prepare Cocos editors for quit', error))
  })
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
