import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const engine = path.resolve(
  process.env.COCOS_ENGINE_SOURCE ?? path.join(root, '../GitNexus/context-engine')
)
const env = { ...process.env, ORCA_BACKGROUND_LAUNCH: '1' }
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed`)
}

async function render() {
  const temporary = await mkdtemp(path.join(tmpdir(), 'cocos-parity-beta-'))
  let child, browser, editorUrl
  try {
    await mkdir(path.join(temporary, 'assets'))
    await mkdir(path.join(temporary, 'settings'))
    await mkdir(path.join(temporary, 'profiles'))
    await writeFile(path.join(temporary, 'profiles/settings.json'), '{"language":"en"}')
    await writeFile(
      path.join(temporary, 'project.json'),
      '{"engine":"cocos-creator-js","version":"2.4.13"}'
    )
    await writeFile(
      path.join(temporary, 'settings/i18n.json'),
      '{"default_language":"sc","languages":["sc","en"]}'
    )
    await writeFile(path.join(temporary, 'settings/project.json'), '{"start-scene":"current"}')
    await writeFile(
      path.join(temporary, 'assets/Panel.prefab'),
      JSON.stringify([
        { __type__: 'cc.Prefab', data: { __id__: 1 } },
        {
          __type__: 'cc.Node',
          _name: 'Panel',
          _active: true,
          _parent: null,
          _children: [],
          _components: [],
          _trs: {
            __type__: 'TypedArray',
            ctor: 'Float64Array',
            array: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1]
          },
          _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
          _contentSize: { __type__: 'cc.Size', width: 120, height: 80 },
          _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
          _opacity: 255
        }
      ])
    )
    await writeFile(
      path.join(temporary, 'assets/Panel.prefab.meta'),
      '{"ver":"1.2.9","uuid":"0ad567aa-6255-45c6-a925-e9b3efdd227b","importer":"prefab","subMetas":{}}'
    )
    await writeFile(
      path.join(temporary, 'assets/EditorProbe.js'),
      `window.cv = {};
window.__businessMessages = 0;
window.addEventListener('message', function(e) { window.__businessMessages++; window.cv.tools.isJSONString(e.data); });
Editor.Profile.load('profile://project/i18n.json', function(error, profile) { if (error) throw error; window.__profileLanguage = profile.data.default_language; });`
    )
    await writeFile(
      path.join(temporary, 'assets/EditorProbe.js.meta'),
      '{"ver":"1.0.8","uuid":"a1111111-1111-4111-8111-111111111111","importer":"javascript","isPlugin":false,"loadPluginInEditor":true,"subMetas":{}}'
    )
    const ready = path.join(temporary, 'ready.json')
    const binary =
      process.env.A5_GAME_CONTEXT_BIN ??
      path.join(engine, 'native-engine/bin/darwin-arm64/a5-game-context')
    child = spawn(
      binary,
      [
        'editor',
        'serve',
        '--project',
        temporary,
        '--web',
        path.join(engine, 'editor-web/dist'),
        '--ready-file',
        ready,
        '--idle-exit',
        '0'
      ],
      {
        cwd: temporary,
        env: {
          ...env,
          A5_EDITOR_PROFILE_DIR: path.join(temporary, 'profiles'),
          A5_NODE_BINARY: process.execPath,
          A5_NODE_EXE: process.execPath
        },
        stdio: 'ignore'
      }
    )
    await new Promise((resolve, reject) => {
      const deadline = Date.now() + 30_000
      const check = async () => {
        if (child.exitCode !== null) {
          reject(new Error('Fixture editor exited before ready'))
          return
        }
        try {
          const value = JSON.parse(await readFile(ready, 'utf8'))
          if (value.url && value.token) {
            const opened = new URL(value.url)
            opened.searchParams.set('token', value.token)
            editorUrl = opened.toString()
            resolve()
            return
          }
        } catch (error) {
          if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
            reject(error)
            return
          }
        }
        if (Date.now() > deadline) {
          reject(new Error('Fixture editor readiness timed out'))
          return
        }
        setTimeout(check, 30)
      }
      child.once('error', reject)
      void check()
    })
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    browser = await chromium.launch({
      headless: true,
      env,
      ...(existsSync(chrome) ? { executablePath: chrome } : {})
    })
    const page = await browser.newPage({ viewport: { width: 1600, height: 850 } })
    const url = new URL(editorUrl)
    url.searchParams.set('doc', 'assets/Panel.prefab')
    await page.goto(url.toString())
    await page.waitForSelector('#toolbar .preview', { timeout: 30_000 })
    if (!process.argv.includes('--layout-only')) {
      await page
        .waitForFunction(() => window.__a5Editor?.ready === true, null, { timeout: 90_000 })
        .catch(async (error) => {
          throw new Error(`Editor readiness failed: ${await page.locator('body').innerText()}`, {
            cause: error
          })
        })
    }
    await page.evaluate(() => {
      const address = document.querySelector('#toolbar .info > div > span')
      if (address) address.textContent = '192.168.0.60:7458'
      const scene = document
        .querySelector('#toolbar .preview')
        .querySelectorAll('ui-select')[1]
        .shadowRoot.querySelector('select')
      scene.replaceChildren(new Option('HotUpdate', 'hot-update'))
    })
    const geometry = []
    for (const width of [1600, 1200, 1000, 900]) {
      await page.setViewportSize({ width, height: 850 })
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      )
      const box = await page.evaluate(() => {
        const rect = (node) => {
          const r = node.getBoundingClientRect()
          return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            right: r.right,
            bottom: r.bottom
          }
        }
        const bar = document.querySelector('#toolbar'),
          preview = bar.querySelector('.preview')
        return {
          toolbar: rect(bar),
          play: rect(preview.querySelector('[aria-label="Play"]')),
          scene: rect(preview.querySelectorAll('ui-select')[1]),
          refresh: rect(preview.querySelector('[aria-label="Refresh Preview"]'))
        }
      })
      geometry.push({ width, ...box })
      assert.equal(
        box.toolbar.height,
        32,
        `Toolbar wrapped at width ${width}: ${JSON.stringify(box)}`
      )
      for (const other of [box.scene, box.refresh]) {
        assert.ok(
          Math.abs(box.play.y + box.play.height / 2 - other.y - other.height / 2) <= 1,
          `Play row wrapped at width ${width}: ${JSON.stringify(box)}`
        )
        assert.ok(other.right <= width && other.x >= 0, `Preview control clipped at width ${width}`)
      }
      assert.ok(
        box.play.right <= box.scene.x + 1 && box.scene.right <= box.refresh.x + 1,
        `Play controls overlap at width ${width}`
      )
      const output = process.env.COCOS_EVIDENCE_DIR
      if (output) {
        await mkdir(output, { recursive: true })
        await page.screenshot({ path: path.join(output, `toolbar-${width}.png`) })
      }
    }
    if (!process.argv.includes('--layout-only')) {
      const frame = page.frames().find((frame) => new URL(frame.url()).pathname.startsWith('/rt/'))
      assert.ok(frame, 'Scene runtime was not mounted')
      await frame.waitForFunction(() => window.__profileLanguage === 'sc', null, {
        timeout: 15_000
      })
      const before = await frame.evaluate(() => ({
        errors: window.__a5PrefabPreview.scriptErrors,
        messages: window.__businessMessages
      }))
      assert.deepEqual(before, { errors: [], messages: 0 })
      const business = await frame.evaluate(async () => {
        window.cv.tools = { isJSONString: (value) => typeof value === 'string' }
        window.postMessage('ordinary-game-message', '*')
        await new Promise((resolve) => setTimeout(resolve, 20))
        return {
          messages: window.__businessMessages,
          errors: window.__a5PrefabPreview.scriptErrors
        }
      })
      assert.deepEqual(business, { messages: 1, errors: [] })
      const profile = new URL('profile?url=profile%3A%2F%2Fproject%2F..%2Fsecret.json', frame.url())
      assert.equal((await page.request.get(profile.toString())).status(), 400)
    }
    console.log(
      JSON.stringify({
        result: 'PASS',
        geometry,
        profileAndTransport: !process.argv.includes('--layout-only')
      })
    )
  } finally {
    await browser?.close()
    if (editorUrl) {
      const shutdown = new URL(editorUrl)
      shutdown.pathname = '/shutdown'
      await fetch(shutdown, { method: 'POST', signal: AbortSignal.timeout(3000) }).catch(() => {})
    }
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise((resolve) => child.once('exit', resolve))
    }
    await rm(temporary, { recursive: true, force: true })
  }
}

try {
  if (process.argv.includes('--render') || process.argv.includes('--layout-only')) await render()
  else {
    run('pnpm', [
      'exec',
      'vitest',
      'run',
      '--config',
      'config/vitest.config.ts',
      'src/main/cocos-agent',
      'src/renderer/src/cocos-agent',
      '--maxWorkers=2'
    ])
    run('npm', ['run', 'test:editor'], engine)
    run('npm', ['run', 'build:editor'], engine)
    await render()
  }
} catch (error) {
  console.error(String(error.stack ?? error).replace(/([?&]token=)[^&\s"']+/g, '$1<REDACTED>'))
  process.exitCode = 1
}
