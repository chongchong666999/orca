const { createHash } = require('node:crypto')
const { readFileSync, statSync } = require('node:fs')
const path = require('node:path')

const packageRoot = process.argv[2] || path.resolve(__dirname, '../a5-game-context')
const sdk = require(path.join(packageRoot, 'scripts/install-cocos-cli-bin.cjs'))
const archive = sdk
  .discoverBundledSdkArchives(packageRoot)
  .find((item) => item.version === '2.4.13')
if (!archive) {
  throw new Error('The application is missing its Cocos 2.4.13 SDK.')
}
const archiveHash = createHash('sha256').update(readFileSync(archive.archivePath)).digest('hex')

function ready() {
  try {
    const registry = JSON.parse(readFileSync(sdk.getSdkRegistryPath(), 'utf8'))
    const entry = registry.find(
      (item) =>
        item.kind === 'cocos' && item.version === '2.4.13' && item.bundledBundleHash === archiveHash
    )
    if (!entry) {
      return false
    }
    sdk.buildBundledSdkEntry(entry.cachePath)
    return statSync(
      path.join(entry.cachePath, 'source-snapshot/bin/cocos2d-js-for-preview.js')
    ).isFile()
  } catch {
    return false
  }
}

if (!ready()) {
  if (sdk.registerBundledSdks(packageRoot) === 0 || !ready()) {
    throw new Error(
      'Could not prepare the bundled Cocos SDK. Check that your user data folder is writable.'
    )
  }
}
console.log('Cocos 2.4.13 SDK ready.')
