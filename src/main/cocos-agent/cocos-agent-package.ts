import path from 'node:path'
import { desktopProduct } from '../../shared/app-lifecycle/desktop-product'
import { COCOS_AGENT_VERSION } from '../../shared/cocos-agent/cocos-agent-version'
import type { DevInstanceIdentity } from '../startup/profile-startup/dev-instance-identity'

export function isCocosAgentPackage(): boolean {
  const executable = process.platform === 'win32' ? 'cocos-agent-beta.exe' : 'cocos-agent-beta'
  return path.basename(process.execPath).toLowerCase() === executable
}

/** About shows cocos-agent's version; app.getVersion() stays Orca's for daemon and CLI checks. */
export function cocosAgentAboutVersion(appVersion: string): string {
  return isCocosAgentPackage() ? COCOS_AGENT_VERSION : appVersion
}

export function applyCocosAgentPackageIdentity(identity: DevInstanceIdentity): DevInstanceIdentity {
  return isCocosAgentPackage() && !identity.isDev
    ? {
        ...identity,
        name: desktopProduct?.name ?? 'cocos-agent',
        appName: 'cocos-agent',
        appUserModelId: 'com.a5labs.cocos-agent'
      }
    : identity
}
