import type { TOptions } from 'i18next'
import { translate } from '@/i18n/i18n'
import { cocosAgentKey } from '../../../shared/cocos-agent/cocos-agent-i18n'

// Why: not named translate*: i18next-cli extraction and the localization scripts only follow the
// upstream translate functions, so cocos-agent keys never have to exist in upstream's en.json.
export function cocosText(key: string, fallback: string, options?: TOptions): string {
  return translate(cocosAgentKey(key), fallback, options)
}
