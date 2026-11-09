import { translateMain } from '../i18n/main-i18n'
import { cocosAgentKey } from '../../shared/cocos-agent/cocos-agent-i18n'

// Why: not named translate*, so the localization extraction never expects these keys in upstream's en.json.
export function cocosTextMain(key: string, fallback: string): string {
  return translateMain(cocosAgentKey(key), fallback)
}
