// Why: overlay keeps the fork's identity out of upstream's builder config so syncing Orca never conflicts here.
const base = require('./electron-builder.config.cjs')
const { existsSync } = require('node:fs')
const path = require('node:path')
const lock = require('./cocos-agent/a5-game-context.lock.json')

const COCOS_AGENT_NAME = 'cocos-agent-beta'
// The a5-game-context package and the editor's preparation script, at the same place on every platform.
const a5GameContextResources = [
  { from: 'resources/cocos-agent/a5-game-context', to: 'a5-game-context' },
  {
    from: 'resources/cocos-agent/a5-game-context/node_modules',
    to: 'a5-game-context/node_modules'
  },
  { from: 'resources/cocos-agent/prepare-editor.cjs', to: 'cocos-agent/prepare-editor.cjs' }
]

async function assertA5GameContextPackage(packageRoot, packageLock) {
  const { requiredPackageEntries } = await import('./scripts/import-a5-game-context.mjs')
  for (const entry of requiredPackageEntries(packageLock)) {
    if (!existsSync(path.join(packageRoot, entry))) {
      throw new Error(`The packaged Cocos editor is missing ${entry}`)
    }
  }
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,
  appId: 'com.a5labs.cocos-agent',
  productName: COCOS_AGENT_NAME,
  artifactName: 'cocos-agent-beta-${version}-${arch}.${ext}',
  dmg: { ...base.dmg, artifactName: 'cocos-agent-beta-${version}-${arch}.${ext}' },
  files: [
    ...base.files,
    '!resources/cocos-agent{,/**/*}',
    '!COCOS-AGENT{,-PLAN}.md',
    '!.mcp.json',
    '!{.context-engine,.cache,.tmp,.anti-slop-plugin,test-results,playwright-report}{,/**/*}'
  ],
  forceCodeSigning: false,
  mac: {
    ...base.mac,
    appId: 'com.a5labs.cocos-agent.internal',
    extendInfo: {
      ...base.mac.extendInfo,
      CFBundleName: COCOS_AGENT_NAME,
      CFBundleDisplayName: COCOS_AGENT_NAME
    },
    identity: '-',
    sign: async (options) => {
      const { signCocosInternalApp } = await import('./scripts/cocos-internal-signing.mjs')
      await signCocosInternalApp(options)
    },
    hardenedRuntime: false,
    notarize: false,
    extraResources: [
      ...base.mac.extraResources,
      ...a5GameContextResources,
      { from: 'resources/cocos-agent/bin', to: 'bin' }
    ]
  },
  // Why a folder of its own: it goes on the user PATH, and cocos-agent's `orca` in resources\bin must not.
  win: {
    ...base.win,
    extraResources: [
      ...base.win.extraResources,
      ...a5GameContextResources,
      { from: 'resources/cocos-agent/win32/a5-game-context-bin', to: 'a5-game-context-bin' }
    ]
  },
  nsis: { ...base.nsis, artifactName: 'cocos-agent-beta-windows-setup.${ext}' },
  afterPack: async (context) => {
    await base.afterPack(context)
    if (context.electronPlatformName === 'win32') {
      const { readA5GameContextLock } = await import('./scripts/import-a5-game-context.mjs')
      const { assertCocosPackageContents } = await import('./scripts/cocos-package-contents.mjs')
      const resources = path.join(context.appOutDir, 'resources')
      assertCocosPackageContents(path.join(resources, 'app.asar'))
      await assertA5GameContextPackage(
        path.join(resources, 'a5-game-context'),
        readA5GameContextLock('win32-x64')
      )
      return
    }
    if (context.electronPlatformName !== 'darwin') {
      return
    }
    const { assertCocosPackageContents } = await import('./scripts/cocos-package-contents.mjs')
    assertCocosPackageContents(
      path.join(
        context.appOutDir,
        `${context.packager.appInfo.productFilename}.app/Contents/Resources/app.asar`
      )
    )
    await assertA5GameContextPackage(
      path.join(
        context.appOutDir,
        `${context.packager.appInfo.productFilename}.app`,
        'Contents/Resources/a5-game-context'
      ),
      lock
    )
  },
  // Packaged package.json name drives Electron's default userData, keeping the official Orca profile untouched.
  extraMetadata: {
    ...base.extraMetadata,
    name: 'cocos-agent',
    productName: 'cocos-agent'
  },
  protocols: [{ name: COCOS_AGENT_NAME, schemes: ['cocos-agent'] }]
}
