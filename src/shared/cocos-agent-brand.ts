import type { PostProcessorModule } from 'i18next'

export const COCOS_AGENT_PRODUCT_NAME = 'cocos-agent'

// Keep the helper's real bundle name so macOS permission prompts still match the copy.
const ORCA_BRAND_PATTERN = /\bOrca\b(?! Computer Use)/g

/** Rebrands every translated string (catalogs and inline English fallbacks) without touching upstream locale files. */
export const cocosAgentBrandPostProcessor: PostProcessorModule = {
  type: 'postProcessor',
  name: 'cocos-agent-brand',
  process: (value: string) => value.replace(ORCA_BRAND_PATTERN, COCOS_AGENT_PRODUCT_NAME)
}

// Why: upstream unit tests assert Orca copy; rebranding there would make every upstream sync fail CI.
export const COCOS_AGENT_BRAND_POST_PROCESS: string[] = globalThis.process?.env?.VITEST
  ? []
  : [cocosAgentBrandPostProcessor.name]
