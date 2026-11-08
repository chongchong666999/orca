// Why: overlay keeps the fork's identity out of upstream's builder config so syncing Orca never conflicts here.
const base = require('./electron-builder.config.cjs')
const { existsSync } = require('node:fs')
const path = require('node:path')
const lock = require('./cocos-agent/a5-game-context.lock.json')

const COCOS_AGENT_NAME = 'cocos-agent-beta'

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
      { from: 'resources/cocos-agent/a5-game-context', to: 'a5-game-context' },
      {
        from: 'resources/cocos-agent/a5-game-context/node_modules',
        to: 'a5-game-context/node_modules'
      },
      { from: 'resources/cocos-agent/bin', to: 'bin' },
      { from: 'resources/cocos-agent/prepare-editor.cjs', to: 'cocos-agent/prepare-editor.cjs' }
    ]
  },
  afterPack: async (context) => {
    await base.afterPack(context)
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
    const { requiredPackageEntries } = await import('./scripts/import-a5-game-context.mjs')
    const packageRoot = path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      'Contents/Resources/a5-game-context'
    )
    for (const entry of requiredPackageEntries(lock)) {
      if (!existsSync(path.join(packageRoot, entry))) {
        throw new Error(`The packaged Cocos editor is missing ${entry}`)
      }
    }
  },
  // Packaged package.json name drives Electron's default userData, keeping the official Orca profile untouched.
  extraMetadata: {
    ...base.extraMetadata,
    name: 'cocos-agent',
    productName: 'cocos-agent'
  },
  protocols: [{ name: COCOS_AGENT_NAME, schemes: ['cocos-agent'] }]
}
