import { createServer, type Server } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { CocosPreviewRouter } from './cocos-preview-router'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(
    cleanups
      .splice(0)
      .toReversed()
      .map((close) => close())
  )
})

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
  )
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('No TCP address')
  }
  return address.port
}

async function project(name: string) {
  let port = 0
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/project/devices?token=')) {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ port }))
    } else {
      response.end(`game-${name}`)
    }
  })
  port = await listen(server)
  return {
    projectRoot: `/projects/${name}`,
    url: `http://127.0.0.1:${port}/?token=private-${name}`,
    startedByApp: true
  }
}

function router() {
  const entry = new CocosPreviewRouter(fetch, 0)
  cleanups.push(() => entry.close())
  return entry
}

it('routes new requests to B while an existing A destination remains pinned and token-free', async () => {
  const [a, b] = await Promise.all([project('A'), project('B')])
  const entry = router()
  expect(await entry.start()).toBe(true)
  entry.select(a)
  const first = await fetch(entry.url, { redirect: 'manual' })
  expect(first.status).toBe(307)
  const pinnedA = first.headers.get('location')
  expect(pinnedA).toBe(`http://127.0.0.1:${new URL(a.url).port}/`)
  expect(pinnedA).not.toContain('private')
  expect(first.headers.get('cache-control')).toBe('no-store')
  entry.select(b)
  const next = await fetch(entry.url, { redirect: 'manual' })
  expect(next.headers.get('location')).toBe(`http://127.0.0.1:${new URL(b.url).port}/`)
  expect(await (await fetch(pinnedA!)).text()).toBe('game-A')
  expect(await (await fetch(next.headers.get('location')!)).text()).toBe('game-B')
})

it('returns unavailable for no selection and refuses unsafe targets without leaking credentials', async () => {
  const entry = router()
  await entry.start()
  expect((await fetch(entry.url)).status).toBe(503)
  entry.select({
    projectRoot: '/invalid',
    url: 'https://example.com/?token=private-secret',
    startedByApp: false
  })
  const response = await fetch(entry.url, { redirect: 'manual' })
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private-secret')
  expect(response.headers.get('location')).toBeNull()
})

it('reports an occupied port without replacing its existing owner', async () => {
  const server = createServer((_request, response) => response.end('external-Creator'))
  const port = await listen(server)
  const entry = new CocosPreviewRouter(fetch, port)
  cleanups.push(() => entry.close())
  expect(await entry.start()).toBe(false)
  expect(entry.warning).toContain('occupied')
  expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('external-Creator')
})

it('does not leave a listener behind when quit races startup', async () => {
  const entry = router()
  const starting = entry.start()
  await entry.close()
  await starting
  expect(await entry.start()).toBe(false)
  expect(entry.url).toBe('')
})

it('does not accept commands or serve a failed project as another selected project', async () => {
  const entry = router()
  await entry.start()
  expect((await fetch(entry.url, { method: 'POST' })).status).toBe(405)
  entry.select({
    projectRoot: '/gone',
    url: 'http://127.0.0.1:1/?token=secret',
    startedByApp: true
  })
  const response = await fetch(entry.url, { redirect: 'manual' })
  expect(response.status).toBe(503)
  expect(response.headers.get('location')).toBeNull()
})
