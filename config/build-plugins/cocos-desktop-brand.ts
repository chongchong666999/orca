import { resolve } from 'node:path'
import type { PluginOption } from 'vite'
import product from '../cocos-agent/desktop-product.json'

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
          },
          // The classic icon also repaints the live Dock tile and window icons. Kept outside resources/ so
          // electron-vite copies it into out/main: the package leaves resources/cocos-agent out of app.asar.
          {
            find: /^(?:\.\.\/)+resources\/icon(?:-dev(?:-mac)?)?\.png(?=\?|$)/,
            replacement: resolve('config/cocos-agent/app-icon.png')
          }
        ]
      }
    }),
    transformIndexHtml: (html) => html.replace(/<title>Orca(?: Agent)?\b/, `<title>${product.name}`)
  }
}
