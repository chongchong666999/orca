import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { CocosEditorRecord } from '../../shared/cocos-agent/cocos-editor-types'
import { editorShutdownUrl } from './cocos-editor-open-output'

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined
}

function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host, port, ipv6Only: true }, () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') reject(new Error('No TCP address'))
      else resolve(address.port)
    })
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

export class CocosPreviewRouter {
  private readonly servers: Server[] = []
  private selected: CocosEditorRecord | null = null
  private starting: Promise<boolean> | undefined
  private closed = false
  private port = 0
  warning: string | undefined

  constructor(
    private readonly fetch: typeof globalThis.fetch,
    private readonly requestedPort = 7456
  ) {}

  get url(): string {
    return this.port ? `http://127.0.0.1:${this.port}/` : ''
  }

  select(editor: CocosEditorRecord | null): void {
    this.selected = editor
  }

  remove(editor: CocosEditorRecord): void {
    if (this.selected?.projectRoot === editor.projectRoot) this.selected = null
  }

  start(): Promise<boolean> {
    if (this.closed) return Promise.resolve(false)
    if (this.starting) return this.starting
    this.starting = this.bind()
    return this.starting
  }

  private async bind(): Promise<boolean> {
    try {
      const ipv4 = this.server()
      this.port = await listen(ipv4, '127.0.0.1', this.requestedPort)
      this.servers.push(ipv4)
      const ipv6 = this.server()
      try {
        await listen(ipv6, '::1', this.port)
        this.servers.push(ipv6)
      } catch (error) {
        if (!['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(String(errorCode(error)))) throw error
      }
      if (!this.closed) return true
    } catch (error) {
      this.warning =
        errorCode(error) === 'EADDRINUSE'
          ? `Preview entry port ${this.requestedPort} is occupied. Release it in the other Creator/application and restart cocos-agent-beta; project-specific preview ports still work.`
          : 'Could not start the current-project preview entry; project-specific preview ports still work.'
    }
    await this.dispose()
    return false
  }

  private server(): Server {
    return createServer((request, response) => {
      void this.respond(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(503)
        response.end('Selected Cocos project is unavailable')
      })
    })
  }

  private async previewPort(editor: CocosEditorRecord): Promise<number | null> {
    const endpoint = editorShutdownUrl(editor.url)
    if (!endpoint) return null
    const url = new URL(endpoint)
    url.pathname = '/project/devices'
    const response = await this.fetch(url.toString(), {
      redirect: 'error',
      signal: AbortSignal.timeout(3_000)
    })
    if (!response.ok) {
      await response.body?.cancel()
      return null
    }
    const value: unknown = await response.json()
    const port = value && typeof value === 'object' && 'port' in value ? value.port : undefined
    return typeof port === 'number' &&
      Number.isInteger(port) &&
      port > 0 &&
      port <= 65535 &&
      port !== this.port
      ? port
      : null
  }

  private async respond(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' })
      response.end('Preview entry accepts GET or HEAD')
      return
    }
    const selected = this.selected
    const port = !this.closed && selected ? await this.previewPort(selected) : null
    if (this.closed || !port) {
      response.writeHead(503)
      response.end('Select an available Cocos project in cocos-agent-beta')
      return
    }
    const path = new URL(request.url ?? '/', 'http://localhost')
    path.searchParams.delete('token')
    const target = new URL(`http://127.0.0.1:${port}/`)
    target.pathname = path.pathname
    target.search = path.search
    response.writeHead(307, { Location: target.toString() })
    response.end()
  }

  async close(): Promise<void> {
    this.closed = true
    this.selected = null
    await this.starting
    await this.dispose()
  }

  private async dispose(): Promise<void> {
    await Promise.all(this.servers.splice(0).map(close))
    this.port = 0
  }
}
