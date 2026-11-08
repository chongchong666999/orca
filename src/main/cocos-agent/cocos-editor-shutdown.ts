const SHUTDOWN_TIMEOUT_MS = 120_000
const SHUTDOWN_PROBE_INTERVAL_MS = 100

function connectionErrorCode(error: unknown): unknown {
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined
  return cause?.code
}

export class CocosEditorShutdown {
  constructor(
    private readonly fetch: typeof globalThis.fetch,
    private readonly settleMs = 5_000
  ) {}

  async post(url: string): Promise<'acknowledged' | 'closed' | 'refused'> {
    try {
      const response = await this.fetch(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(SHUTDOWN_TIMEOUT_MS)
      })
      await response.body?.cancel().catch(() => undefined)
      return response.ok ? 'acknowledged' : 'refused'
    } catch (error) {
      if (connectionErrorCode(error) === 'ECONNREFUSED') {
        return 'closed'
      }
      // The server may have saved and exited after the request timed out.
      return (await this.waitUntilClosed(new URL(url).origin)) ? 'closed' : 'refused'
    }
  }

  async request(url: string): Promise<'closed' | 'closing' | 'refused'> {
    const posted = await this.post(url)
    if (posted !== 'acknowledged') {
      return posted
    }
    return (await this.waitUntilClosed(new URL(url).origin)) ? 'closed' : 'closing'
  }

  async waitUntilClosed(origin: string): Promise<boolean> {
    const deadline = Date.now() + this.settleMs
    while (Date.now() < deadline) {
      try {
        const response = await this.fetch(origin, {
          method: 'HEAD',
          signal: AbortSignal.timeout(SHUTDOWN_PROBE_INTERVAL_MS * 5)
        })
        await response.body?.cancel().catch(() => undefined)
      } catch (error) {
        const code = connectionErrorCode(error)
        if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
          return true
        }
      }
      await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_PROBE_INTERVAL_MS))
    }
    return false
  }
}
