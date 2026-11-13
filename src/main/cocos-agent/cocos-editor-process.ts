import { spawnProcess } from '@orca/process-host'
import type { ProcessResult, ProcessSpec } from '@orca/process-host/process-spec'

/** Settles on exit: the editor `editor open` starts inherits its pipes on Windows, so they never close. */
export function runCocosEditorProcess(spec: ProcessSpec): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess({ ...spec, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    let drain: ReturnType<typeof setTimeout> | undefined
    const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      clearTimeout(drain)
      child.stdout?.destroy()
      child.stderr?.destroy()
      resolve({ code, signal, stdout, stderr, timedOut })
    }
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
      drain = setTimeout(() => finish(null, null), 2000)
    }, spec.timeoutMs ?? 180_000)
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-1024 * 1024)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-1024 * 1024)
    })
    child.stdin?.on('error', () => {})
    child.stdout?.on('error', () => {})
    child.stderr?.on('error', () => {})
    child.stdin?.end()
    child.once('error', (error) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        clearTimeout(drain)
        reject(error)
      }
    })
    child.once('exit', (code, signal) => {
      drain = setTimeout(() => finish(code, signal), 100)
    })
    child.once('close', finish)
  })
}
