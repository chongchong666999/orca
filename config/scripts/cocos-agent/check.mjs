import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { resolveOxlintInvocation } from '../tool-invocation/oxlint-cli-invocation.mjs'
import { main as checkTouchPoints } from './check-upstream-touch-points.mjs'

const root = path.resolve(import.meta.dirname, '../../..')
const renderer = 'src/renderer/src/components'

// A file can still differ from upstream after a merge that dropped just the Cocos call.
const hooks = [
  ['electron.vite.config.ts', 'cocosDesktopBrand()', 2],
  ['config/build-plugins/cocos-desktop-brand.ts', "resolve('config/cocos-agent/app-icon.png')"],
  ['config/electron-builder.cocos-agent.cjs', "icon: 'resources/cocos-agent/icons/icon.icns'"],
  ['src/shared/i18n/orca-i18n-instance.ts', 'translateWithCocosBrand(i18n, key,'],
  ['src/main/github/client/fetch/orca-star.ts', 'productRepository'],
  [`${renderer}/onboarding/landing/Landing.tsx`, 'productRepositoryUrl'],
  ['src/main/startup/main-process-ipc-bootstrap.ts', 'registerCocosAgentIpc()'],
  ['src/preload/index.ts', "import './cocos-agent-preload'"],
  [`${renderer}/tab-bar/strip/tab-bar-surface.tsx`, '<CocosEditorMenuItems'],
  [
    `${renderer}/right-sidebar/activity-bar/use-right-sidebar-activity-items.ts`,
    'cocosSidebarActivityItems()'
  ],
  [`${renderer}/right-sidebar/right-sidebar-panel-content.tsx`, '<SidebarTerminalPanel'],
  ['src/renderer/src/store/index.ts', '...createSidebarTerminalSlice('],
  [`${renderer}/settings/general/GeneralPane.tsx`, '<CocosToolchainSettings'],
  ['package.json', '"cocos:check"']
]

let failed = checkTouchPoints(process.argv.slice(2)) !== 0
for (const icon of [
  'config/cocos-agent/app-icon.png',
  'resources/cocos-agent/icons/icon.icns',
  'resources/cocos-agent/icons/icon.ico',
  'resources/cocos-agent/logo.svg'
]) {
  if (!existsSync(path.join(root, icon))) {
    console.error(`[cocos-agent] missing icon asset: ${icon}`)
    failed = true
  }
}
for (const [file, hook, minimum = 1] of hooks) {
  const source = readFileSync(path.join(root, file), 'utf8')
  if (source.split(hook).length <= minimum) {
    console.error(`[cocos-agent] ${file}: restore the ${hook} integration`)
    failed = true
  }
}
if (failed) {
  process.exitCode = 1
} else {
  const lint = resolveOxlintInvocation(root)
  execFileSync(
    lint.command,
    [
      ...lint.prefixArgs,
      '--deny-warnings',
      'config/build-plugins/cocos-desktop-brand.ts',
      'config/electron-builder.cocos-agent.cjs',
      'config/scripts/build-cocos-agent-mac.mjs',
      'config/scripts/cocos-package-contents.mjs',
      'config/scripts/cocos-agent',
      'src/main/cocos-agent',
      'src/preload/cocos-agent-preload.ts',
      'src/renderer/src/cocos-agent',
      'src/shared/cocos-agent',
      'src/shared/app-lifecycle/desktop-product.ts'
    ],
    { cwd: root, stdio: 'inherit' }
  )
  console.log('[cocos-agent] integration and lint checks passed')
}
