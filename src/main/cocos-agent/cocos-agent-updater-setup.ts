import type { UpdateCheckOptions } from '../../shared/updater/update-status-types'
import { UpdaterSetup } from '../updater/lifecycle/updater-setup'
import { isCocosAgentPackage } from './cocos-agent-package'

/** cocos-agent has no release feed yet; Orca's hardcoded feed would offer Orca builds and stage them in Orca's ShipIt cache. */
export class CocosAgentUpdaterSetup extends UpdaterSetup {
  protected override runBackgroundUpdateCheck(nudgeId?: string): boolean {
    if (!isCocosAgentPackage()) {
      return super.runBackgroundUpdateCheck(nudgeId)
    }
    this.sendStatus({ state: 'not-available' })
    return false
  }

  // Why: menu, pinned-build, and remote-status checks all funnel through here.
  override checkForUpdatesFromMenu(options?: UpdateCheckOptions): void {
    if (!isCocosAgentPackage()) {
      super.checkForUpdatesFromMenu(options)
      return
    }
    this.sendStatus({ state: 'not-available', userInitiated: true })
  }
}
