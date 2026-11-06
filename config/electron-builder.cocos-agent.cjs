// Why: overlay keeps the fork's identity out of upstream's builder config so syncing Orca never conflicts here.
const base = require('./electron-builder.config.cjs')
const { randomUUID } = require('node:crypto')
const { existsSync } = require('node:fs')
const path = require('node:path')
const lock = require('./cocos-agent/a5-game-context.lock.json')

const COCOS_AGENT_NAME = 'cocos-agent'

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,
  appId: 'com.a5labs.cocos-agent',
  productName: COCOS_AGENT_NAME,
  artifactName: 'cocos-agent-${version}-${arch}.${ext}',
  dmg: { ...base.dmg, artifactName: 'cocos-agent-${version}-${arch}.${ext}' },
  files: [...base.files, '!resources/cocos-agent{,/**/*}', '!COCOS-AGENT{,-PLAN}.md'],
  forceCodeSigning: false,
  mac: {
    ...base.mac,
    // Ad-hoc builds cannot share a TCC client while an older build still owns live terminals.
    appId: `com.a5labs.cocos-agent.adhoc.b${randomUUID().replaceAll('-', '')}`,
    identity: '-',
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
    name: COCOS_AGENT_NAME,
    productName: COCOS_AGENT_NAME
  },
  protocols: [{ name: COCOS_AGENT_NAME, schemes: [COCOS_AGENT_NAME] }]
}
