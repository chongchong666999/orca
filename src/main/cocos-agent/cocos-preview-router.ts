import { connect, createServer, type Server, type Socket } from 'node:net'
import type { CocosEditorRecord } from '../../shared/cocos-agent/cocos-editor-types'
import { readCocosPreviewPort } from './cocos-preview-port'

const LOOPBACK_PEERS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const IPV6_UNAVAILABLE = new Set(['EAFNOSUPPORT', 'EADDRNOTAVAIL'])

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host, port, ipv6Only: host === '::' }, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

function ipv6Unavailable(error: unknown): boolean {
  return error instanceof Error && 'code' in error && IPV6_UNAVAILABLE.has(String(error.code))
}

export class CocosPreviewRouter {
  private listeners: Server[] = []
  private starting: Promise<boolean> | undefined
  private closing: Promise<void> | undefined
  private selected: CocosEditorRecord | null = null
  private retry: ReturnType<typeof setInterval> | undefined
  private readonly clients = new Set<Socket>()
  private warnedBindFailure = false

  constructor(
    private readonly fetch: typeof globalThis.fetch,
    private readonly port = 7456
  ) {}

  select(editor: CocosEditorRecord | null): void {
    if (this.selected?.url === editor?.url) {
      return
    }
    this.selected = editor
    if (editor && !this.retry) {
      this.retry = setInterval(() => {
        if (!this.closing && !this.listeners.length) {
          void this.start()
        }
      }, 1000)
      this.retry.unref()
    } else if (!editor && this.retry) {
      clearInterval(this.retry)
      this.retry = undefined
    }
    // Connections retained by Electron must reconnect to the newly selected project.
    for (const client of this.clients) {
      client.destroy()
    }
  }

  remove(editor: CocosEditorRecord): void {
    if (this.selected?.projectRoot === editor.projectRoot) {
      this.select(null)
    }
  }

  start(): Promise<boolean> {
    if (this.closing) {
      return Promise.resolve(false)
    }
    if (this.listeners.length && !this.starting) {
      return Promise.resolve(true)
    }
    this.starting ??= this.bind().finally(() => {
      this.starting = undefined
    })
    return this.starting
  }

  private async bind(): Promise<boolean> {
    const ipv4 = this.createListener()
    const ipv6 = this.createListener()
    try {
      // macOS can bind IPv6 even when IPv4 already owns the port. Reserve both families explicitly.
      await listen(ipv4, '0.0.0.0', this.port)
      ipv4.on('error', (error) =>
        console.warn('[cocos-agent] Preview router listener error.', error)
      )
      this.listeners.push(ipv4)
      try {
        await listen(ipv6, '::', this.port)
        ipv6.on('error', (error) =>
          console.warn('[cocos-agent] Preview router listener error.', error)
        )
        this.listeners.push(ipv6)
      } catch (error) {
        if (!ipv6Unavailable(error)) {
          throw error
        }
      }
      this.warnedBindFailure = false
      return true
    } catch (error) {
      await this.dispose()
      if (!this.warnedBindFailure) {
        this.warnedBindFailure = true
        console.warn(
          `[cocos-agent] Could not bind the local preview entry on port ${this.port}.`,
          error
        )
      }
      return false
    }
  }

  private createListener(): Server {
    return createServer({ pauseOnConnect: true }, (client) => {
      if (!client.remoteAddress || !LOOPBACK_PEERS.has(client.remoteAddress)) {
        client.destroy()
        return
      }
      this.clients.add(client)
      client.on('error', () => client.destroy())
      client.once('close', () => this.clients.delete(client))
      if (this.starting) {
        void this.starting.then((ready) => {
          if (ready) {
            void this.forward(client)
          } else {
            client.destroy()
          }
        })
      } else {
        void this.forward(client)
      }
    })
  }

  private async forward(client: Socket): Promise<void> {
    const editor = this.selected
    const target = editor ? await readCocosPreviewPort(editor.url, this.fetch) : null
    if (client.destroyed || this.closing) {
      return
    }
    if (!target || target === this.port) {
      client.end(
        'HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
      )
      return
    }
    // Forward the connection so redirects, assets and WebSocket reloads retain the 7456 origin.
    const upstream = connect(target, '127.0.0.1')
    upstream.on('error', () => client.destroy())
    client.once('close', () => upstream.destroy())
    client.pipe(upstream).pipe(client)
    client.resume()
  }

  close(): Promise<void> {
    this.select(null)
    this.warnedBindFailure = false
    this.closing ??= this.closeListener().finally(() => {
      this.closing = undefined
    })
    return this.closing
  }

  private async closeListener(): Promise<void> {
    await this.starting
    await this.dispose()
  }

  private async dispose(): Promise<void> {
    const closed = this.listeners.splice(0).map(close)
    for (const client of this.clients) {
      client.destroy()
    }
    await Promise.all(closed)
  }
}
