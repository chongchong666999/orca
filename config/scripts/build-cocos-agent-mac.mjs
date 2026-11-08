import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getLocalBuildIdentity } from './build-mac-local.mjs'
import { prepareInternalSigning } from './cocos-internal-signing.mjs'

const skipTypecheck = process.argv.includes('--skip-typecheck')
const release = process.argv.includes('--release')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const appPath = `dist/mac-${process.arch}/cocos-agent-beta.app`

function run(args, env = { ...process.env, ORCA_SKIP_DEV_CLI_INSTALL: '1' }) {
  execFileSync(pnpm, args, { env, stdio: 'inherit' })
}

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('cocos-agent v0.1 builds require an Apple Silicon Mac')
}
const signing = prepareInternalSigning()

execFileSync(process.execPath, ['config/scripts/import-a5-game-context.mjs'], { stdio: 'inherit' })
run(['run', skipTypecheck ? 'build:desktop:assets' : 'build:desktop'])
run(['run', 'build:native'])
run(['run', 'ensure:electron-runtime'])

const identity = getLocalBuildIdentity()
console.log(`[build:cocos-agent] local version ${identity.version} (${process.arch})`)
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
    ORCA_LOCAL_BUILD_VERSION: identity.version
  }
)
console.log(`[build:cocos-agent] done: ${appPath}`)
execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
  stdio: 'inherit'
})
const bundleId = execFileSync(
  '/usr/bin/plutil',
  ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(appPath, 'Contents/Info.plist')],
  { encoding: 'utf8' }
).trim()
if (bundleId !== 'com.a5labs.cocos-agent.internal') {
  throw new Error('The internal macOS package must keep its stable signing identity')
}
const requirement = execFileSync('codesign', ['-d', '-r-', appPath], { encoding: 'utf8' })
if (!requirement.toLowerCase().includes(signing.identity.toLowerCase())) {
  throw new Error('The app was not signed with the persistent internal certificate')
}
console.log(`[build:cocos-agent] privacy identity: ${bundleId}`)
if (release) {
  for (const ext of ['dmg', 'zip']) {
    const file = `cocos-agent-beta-${identity.version}-arm64.${ext}`
    const output = path.join('dist', file)
    const hash = createHash('sha256').update(readFileSync(output)).digest('hex')
    writeFileSync(`${output}.sha256`, `${hash}  ${file}\n`)
    console.log(`[build:cocos-agent] release: ${output}`)
  }
}
