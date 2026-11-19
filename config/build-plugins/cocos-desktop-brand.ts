import { resolve } from 'node:path'
import type { PluginOption } from 'vite'

const product = {
  name: 'Cocos Agent',
  githubRepository: 'sky-jp_A5labsco/cocos-agent'
}

export function cocosDesktopBrand(): PluginOption {
  if (process.env.COCOS_AGENT_DESKTOP !== '1') {
    return false
  }
  return {
    name: 'cocos-desktop-brand',
    config: () => ({
      define: { __DESKTOP_PRODUCT__: JSON.stringify(product) },
      resolve: {
        alias: [
          {
            find: /^(?:\.\.\/)+resources\/logo\.svg$/,
            replacement: resolve('resources/cocos-agent/logo.svg')
          }
        ]
      }
    }),
    transformIndexHtml: (html) => html.replace(/<title>Orca\b/, `<title>${product.name}`)
  }
}
