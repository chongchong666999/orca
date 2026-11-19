import path from 'node:path'
import { desktopProduct } from '../../shared/app-lifecycle/desktop-product'
import type { DevInstanceIdentity } from '../startup/profile-startup/dev-instance-identity'

export function isCocosAgentPackage(): boolean {
  const executable = process.platform === 'win32' ? 'cocos-agent-beta.exe' : 'cocos-agent-beta'
  return path.basename(process.execPath).toLowerCase() === executable
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
