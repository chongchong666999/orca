import type { i18n as I18nInstance, ThirdPartyModule } from 'i18next'
import en from './i18n/en.json'
import zh from './i18n/zh.json'
import zhHant from './i18n/zh-Hant.json'
import { desktopProduct } from '../app-lifecycle/desktop-product'

// Only static product chrome is branded. Translated workspace names, paths and commands can contain "Orca".
export function cocosBrandText(i18n: I18nInstance, key: string, text: string): string {
  if (!desktopProduct) {
    return text
  }
  switch (key) {
    case 'auto.components.Landing.6ca6ff404e':
      return desktopProduct.name.toUpperCase()
    case 'auto.App.5096cbbc86':
      return desktopProduct.name
    case 'auto.components.StarNagCard.30c36231c1':
    case 'auto.components.star.nag.StarNagToastHost.body':
      return i18n.t(cocosAgentKey('brand.starPrompt'), { defaultValue: en.brand.starPrompt })
    case 'auto.components.Landing.520304a067':
    case 'auto.components.onboarding.OnboardingFlow.277ba45540':
    case 'auto.components.onboarding.OnboardingFlow.a249f81538':
    case 'auto.components.onboarding.OnboardingFlow.1b5e182e9f':
    case 'auto.components.sidebar.SidebarNav.1b5c41caee':
    case 'auto.components.settings.GeneralSupportSection.55a87e5fd1':
    case 'auto.components.settings.GeneralSupportSection.6922c1fa2b':
    case 'auto.components.settings.general.search.36a72f0d9e':
    case 'auto.components.StarNagCard.5f6df21046':
    case 'auto.components.sidebar.SidebarSettingsHelpMenu.5161eef55d':
    case 'auto.components.sidebar.SidebarSettingsHelpMenu.4e8f5710d3':
    case 'auto.components.sidebar.SidebarSettingsHelpMenu.ad3d3ed7f1':
    case 'auto.main.window.dashboard.popout.window.title':
    case 'native.dialog.dashboardTitle':
    case 'native.dialog.spaceTitle':
      return text.replace(/Orca/g, desktopProduct.name)
    default:
      return text
  }
}

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
