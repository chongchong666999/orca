// Builds the Windows x64 cocos-agent on a Windows host: Orca's Windows build plus the a5-game-context package
// config/cocos-agent/a5-game-context.lock.json pins for win32-x64 and its launchers, which the app
// puts on the user PATH at launch. Usage: node config/scripts/build-cocos-agent-win.mjs [--skip-typecheck] [--release]
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { getLocalBuildIdentity } from './build-mac-local.mjs'
import { resolvePnpmCliInvocation } from './pnpm-cli-invocation.mjs'

const skipTypecheck = process.argv.includes('--skip-typecheck')
const release = process.argv.includes('--release')
const appDirectory = 'dist/win-unpacked'

function run(args, env = { ...process.env, ORCA_SKIP_DEV_CLI_INSTALL: '1' }) {
  const pnpm = resolvePnpmCliInvocation()
  execFileSync(pnpm.command, [...pnpm.prefixArgs, ...args], {
    env,
    stdio: 'inherit',
    shell: pnpm.shell
  })
}

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('The Windows cocos-agent builds on Windows x64')
}

execFileSync(
  process.execPath,
  ['config/scripts/import-a5-game-context.mjs', '--target', 'win32-x64'],
  { stdio: 'inherit' }
)
run(['run', skipTypecheck ? 'build:desktop:assets' : 'build:desktop'])
run(['run', 'build:native'])
run(['run', 'ensure:electron-runtime'])

const identity = getLocalBuildIdentity()
console.log(`[build:cocos-agent] local version ${identity.version} (win32-x64)`)
run(
  [
    'exec',
    'electron-builder',
    '--config',
    'config/electron-builder.cocos-agent.cjs',
    '--win',
    release ? 'nsis' : 'dir',
    '--x64'
  ],
  {
    ...process.env,
    ORCA_BUILD_COMMIT: identity.commit,
    ORCA_LOCAL_BUILD_VERSION: identity.version
  }
)
for (const launcher of ['a5-game-context.cmd', 'cocos-cli.cmd', 'a5-game-context', 'cocos-cli']) {
  if (!existsSync(path.join(appDirectory, 'resources', 'a5-game-context-bin', launcher))) {
    throw new Error(`The Windows package is missing resources\\a5-game-context-bin\\${launcher}`)
  }
}
console.log(
  `[build:cocos-agent] done: ${appDirectory}${release ? ' and the installer in dist/' : ''}`
)
