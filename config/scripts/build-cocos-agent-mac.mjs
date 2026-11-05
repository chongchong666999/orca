import { execFileSync } from 'node:child_process'
import { getLocalBuildIdentity } from './build-mac-local.mjs'

// Mirrors `pnpm build:mac`, but packages only an unsigned .app for the host CPU with the cocos-agent identity.
const skipTypecheck = process.argv.includes('--skip-typecheck')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(args, env = process.env) {
  execFileSync(pnpm, args, { env, stdio: 'inherit' })
}

if (process.platform !== 'darwin') {
  throw new Error('build-cocos-agent-mac only runs on macOS')
}

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
    'dir',
    `--${process.arch}`
  ],
  {
    ...process.env,
    ORCA_BUILD_COMMIT: identity.commit,
    ORCA_LOCAL_BUILD_VERSION: identity.version
  }
)
console.log(`[build:cocos-agent] done: dist/mac-${process.arch}/cocos-agent.app`)
