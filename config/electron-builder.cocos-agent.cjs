// Why: overlay keeps the fork's identity out of upstream's builder config so syncing Orca never conflicts here.
const base = require('./electron-builder.config.cjs')

const COCOS_AGENT_NAME = 'cocos-agent'

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,
  appId: 'com.a5labs.cocos-agent',
  productName: COCOS_AGENT_NAME,
  // Packaged package.json name drives Electron's default userData, keeping the official Orca profile untouched.
  extraMetadata: {
    ...base.extraMetadata,
    name: COCOS_AGENT_NAME,
    productName: COCOS_AGENT_NAME
  },
  protocols: [{ name: COCOS_AGENT_NAME, schemes: [COCOS_AGENT_NAME] }]
}
