import type { UpdateCheckOptions } from '../../shared/update-status-types'
import { UpdaterSetup } from './lifecycle/updater-setup'

/** cocos-agent has no release feed yet; Orca's hardcoded feed would offer Orca builds and stage them in Orca's ShipIt cache. */
export class CocosAgentUpdaterSetup extends UpdaterSetup {
  protected override runBackgroundUpdateCheck(): boolean {
    this.sendStatus({ state: 'not-available' })
    return false
  }

  // Why: menu, pinned-build, and remote-status checks all funnel through here.
  override checkForUpdatesFromMenu(_options?: UpdateCheckOptions): void {
    this.sendStatus({ state: 'not-available', userInitiated: true })
  }
}
