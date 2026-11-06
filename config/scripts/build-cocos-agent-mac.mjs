import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getLocalBuildIdentity } from './build-mac-local.mjs'

const skipTypecheck = process.argv.includes('--skip-typecheck')
const release = process.argv.includes('--release')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(args, env = { ...process.env, ORCA_SKIP_DEV_CLI_INSTALL: '1' }) {
  execFileSync(pnpm, args, { env, stdio: 'inherit' })
}

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('cocos-agent v0.1 builds require an Apple Silicon Mac')
}

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
console.log(`[build:cocos-agent] done: dist/mac-${process.arch}/cocos-agent.app`)
execFileSync('codesign', ['--verify', '--deep', '--strict', 'dist/mac-arm64/cocos-agent.app'], {
  stdio: 'inherit'
})
if (release) {
  for (const ext of ['dmg', 'zip']) {
    const file = `cocos-agent-${identity.version}-arm64.${ext}`
    const output = path.join('dist', file)
    const hash = createHash('sha256').update(readFileSync(output)).digest('hex')
    writeFileSync(`${output}.sha256`, `${hash}  ${file}\n`)
    console.log(`[build:cocos-agent] release: ${output}`)
  }
}
