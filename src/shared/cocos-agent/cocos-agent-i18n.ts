import type { i18n as I18nInstance, ThirdPartyModule } from 'i18next'
import en from './i18n/en.json'
import zh from './i18n/zh.json'
import zhHant from './i18n/zh-Hant.json'

/** cocos-agent copy lives in its own namespace so upstream's locale catalogs stay untouched. */
export const COCOS_AGENT_I18N_NAMESPACE = 'cocosAgent'

const CATALOGS: Record<string, Record<string, unknown>> = { en, zh, 'zh-Hant': zhHant }

/** Prefixes a bundle key (`sidebar.terminal.title`) with the namespace i18next resolves it from. */
export function cocosAgentKey(key: string): string {
  return `${COCOS_AGENT_I18N_NAMESPACE}:${key}`
}

// Why: i18next runs 3rdParty init after its ResourceStore exists but before `addResourceBundle` is
// bound onto the instance (the store's own copy is untyped), so the catalog goes straight into the
// store's resource tree. The namespace is never listed in `ns`, so the backend is never asked for
// it and the renderer's lazy `translation` catalog loading is unaffected.
export const cocosAgentI18nModule: ThirdPartyModule = {
  type: '3rdParty',
  init: (i18n: I18nInstance) => {
    for (const [language, catalog] of Object.entries(CATALOGS)) {
      i18n.store.data[language] = {
        ...i18n.store.data[language],
        [COCOS_AGENT_I18N_NAMESPACE]: catalog
      }
    }
  }
}
