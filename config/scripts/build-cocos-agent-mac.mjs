import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getLocalBuildIdentity } from './desktop-distribution/macos/build-mac-local.mjs'
import { cocosAgentVersion, createCocosAgentBetaBuild } from './cocos-agent-beta-build.mjs'
import { prepareInternalSigning } from './cocos-internal-signing.mjs'
import product from '../cocos-agent/desktop-product.json' with { type: 'json' }

const skipTypecheck = process.argv.includes('--skip-typecheck')
const release = process.argv.includes('--release')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const appPath =
  process.arch === 'x64'
    ? 'dist/mac/cocos-agent-beta.app'
    : `dist/mac-${process.arch}/cocos-agent-beta.app`

function run(
  args,
  env = { ...process.env, ORCA_SKIP_DEV_CLI_INSTALL: '1', COCOS_AGENT_DESKTOP: '1' }
) {
  execFileSync(pnpm, args, { env, stdio: 'inherit' })
}

if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) {
  throw new Error('cocos-agent v0.1 builds require a macOS (arm64 or x64) host')
}
const signing = prepareInternalSigning()

execFileSync(
  process.execPath,
  ['config/scripts/import-a5-game-context.mjs', '--target', `darwin-${process.arch}`],
  { stdio: 'inherit' }
)
run(['run', skipTypecheck ? 'build:desktop:assets' : 'build:desktop'])
run(['run', 'build:native'])
run(['run', 'ensure:electron-runtime'])

const identity = getLocalBuildIdentity()
// The dmg and zip are named by cocos-agent's version (cocos-agent-beta-build.mjs); the app's own stays Orca's.
const beta = createCocosAgentBetaBuild(cocosAgentVersion(), new Date(), identity.commit)
console.log(
  `[build:cocos-agent] beta ${beta}, internal version ${identity.version} (${process.arch})`
)
run(
  [
    'exec',
    'electron-builder',
    '--config',
    'config/electron-builder.cocos-agent.cjs',
    '--mac',
    ...(release ? ['dmg', 'zip'] : ['dir']),
    `--${process.arch}`
  ],
  {
    ...process.env,
    ORCA_BUILD_COMMIT: identity.commit,
    ORCA_LOCAL_BUILD_VERSION: identity.version,
    COCOS_AGENT_BETA_BUILD: beta
  }
)
console.log(`[build:cocos-agent] done: ${appPath}`)
execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
  stdio: 'inherit'
})
function bundleProperty(key) {
  return execFileSync(
    '/usr/bin/plutil',
    ['-extract', key, 'raw', '-o', '-', path.join(appPath, 'Contents/Info.plist')],
    { encoding: 'utf8' }
  ).trim()
}

const bundleId = bundleProperty('CFBundleIdentifier')
if (bundleId !== 'com.a5labs.cocos-agent.internal') {
  throw new Error('The internal macOS package must keep its stable signing identity')
}
if (bundleProperty('CFBundleDisplayName') !== product.name) {
  throw new Error('The macOS bundle must display the Cocos product name')
}
const bundleIcon = readFileSync(
  path.join(appPath, 'Contents/Resources', bundleProperty('CFBundleIconFile'))
)
if (!bundleIcon.equals(readFileSync('resources/cocos-agent/icons/icon.icns'))) {
  throw new Error('The macOS bundle must use the Cocos icon')
}
const requirement = execFileSync('codesign', ['-d', '-r-', appPath], { encoding: 'utf8' })
if (!requirement.toLowerCase().includes(signing.identity.toLowerCase())) {
  throw new Error('The app was not signed with the persistent internal certificate')
}
console.log(`[build:cocos-agent] privacy identity: ${bundleId}`)
if (release) {
  for (const ext of ['dmg', 'zip']) {
    const file = `cocos-agent-beta-${beta}-${process.arch}.${ext}`
    const output = path.join('dist', file)
    const hash = createHash('sha256').update(readFileSync(output)).digest('hex')
    writeFileSync(`${output}.sha256`, `${hash}  ${file}\n`)
    console.log(`[build:cocos-agent] release: ${output}`)
  }
}
