import type { i18n as I18nInstance, ThirdPartyModule, TOptions } from 'i18next'
import en from './i18n/en.json'
import zh from './i18n/zh.json'
import zhHant from './i18n/zh-Hant.json'
import { desktopProduct } from '../app-lifecycle/desktop-product'

/** cocos-agent copy lives in its own namespace so upstream's locale catalogs stay untouched. */
export const COCOS_AGENT_I18N_NAMESPACE = 'cocosAgent'

const CATALOGS: Record<string, Record<string, unknown>> = { en, zh, 'zh-Hant': zhHant }

/** Prefixes a bundle key (`sidebar.terminal.title`) with the namespace i18next resolves it from. */
export function cocosAgentKey(key: string): string {
  return `${COCOS_AGENT_I18N_NAMESPACE}:${key}`
}

// Named Orca services and helper bundle paths still refer to upstream products.
const ORCA_BRAND_PATTERN =
  /\bOrca(?: Agent)?\b(?!\.app\b|\/|\s+(?:Cloud\b|Relay\b|Mobile\b|Computer Use\b|云|雲|手机端|手機端))/g

/** Names the product in one upstream template; the landing wordmark is the only all-caps "ORCA". */
function brandOrcaTemplate(text: string, productName: string): string {
  return text === 'ORCA' ? productName.toUpperCase() : text.replace(ORCA_BRAND_PATTERN, productName)
}

function brandCatalog(value: unknown, productName: string): unknown {
  if (typeof value === 'string') {
    return brandOrcaTemplate(value, productName)
  }
  if (Array.isArray(value)) {
    return value.map((item) => brandCatalog(item, productName))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, brandCatalog(item, productName)])
    )
  }
  return value
}

// Why: branding catalog templates, not rendered text, leaves interpolated workspace names and paths alone.
function brandCatalogStore(i18n: I18nInstance, productName: string): void {
  const brandPack = (language: string, namespace: string): void => {
    const packs = i18n.store.data[language]
    if (namespace !== COCOS_AGENT_I18N_NAMESPACE && packs?.[namespace]) {
      packs[namespace] = brandCatalog(packs[namespace], productName) as (typeof packs)[string]
    }
  }
  for (const [language, packs] of Object.entries(i18n.store.data)) {
    for (const namespace of Object.keys(packs)) {
      brandPack(language, namespace)
    }
  }
  // Lazily loaded languages and plugin packs arrive through addResourceBundle, which emits 'added'.
  i18n.store.on('added', brandPack)
}

/** The Star prompt names the Cocos project instead of only swapping the product name. */
export function translateWithCocosBrand(
  i18n: I18nInstance,
  key: string,
  options: TOptions
): string {
  if (!desktopProduct) {
    return i18n.t(key, options)
  }
  switch (key) {
    case 'auto.components.StarNagCard.30c36231c1':
    case 'auto.components.star.nag.StarNagToastHost.body':
      return i18n.t(cocosAgentKey('brand.starPrompt'), { defaultValue: en.brand.starPrompt })
    default:
      return i18n.t(
        key,
        typeof options.defaultValue === 'string'
          ? {
              ...options,
              defaultValue: brandOrcaTemplate(options.defaultValue, desktopProduct.name)
            }
          : options
      )
  }
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
    if (desktopProduct) {
      brandCatalogStore(i18n, desktopProduct.name)
    }
  }
}
