import type { CocosAgentPreloadApi } from '../../../shared/cocos-agent/cocos-editor-types'

declare global {
  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- declaration merging requires interface
  interface Window {
    /** Exposed by src/preload/cocos-agent-preload.ts; absent in the web client and in tests. */
    cocosAgent?: CocosAgentPreloadApi
  }
}
