import type { PostProcessorModule } from 'i18next'

export const COCOS_AGENT_PRODUCT_NAME = 'cocos-agent-beta'

// Every "Star on GitHub" entry (landing, settings, star nag) stars and opens this repo instead of stablyai/orca.
export const COCOS_AGENT_GITHUB_REPO = 'A5Labs-Prime/a5-game-context-server'
export const COCOS_AGENT_GITHUB_URL = `https://github.com/${COCOS_AGENT_GITHUB_REPO}`

// Keep the helper's real bundle name so macOS permission prompts still match the copy.
const ORCA_BRAND_PATTERN = /\bOrca\b(?! Computer Use)/g

/** Rebrands every translated string (catalogs and inline English fallbacks) without touching upstream locale files. */
export const cocosAgentBrandPostProcessor: PostProcessorModule = {
  type: 'postProcessor',
  name: 'cocos-agent-brand',
  // The landing wordmark is the only all-caps "ORCA" string.
  process: (value: string) =>
    value === 'ORCA' ? 'COCOS AGENT' : value.replace(ORCA_BRAND_PATTERN, COCOS_AGENT_PRODUCT_NAME)
}

// Why: upstream unit tests assert Orca copy; rebranding there would make every upstream sync fail CI.
export const COCOS_AGENT_BRAND_POST_PROCESS: string[] = globalThis.process?.env?.VITEST
  ? []
  : [cocosAgentBrandPostProcessor.name]
