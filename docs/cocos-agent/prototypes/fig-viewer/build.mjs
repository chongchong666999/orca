/* oxlint-disable eslint/curly, unicorn/prefer-import-meta-properties -- build script must run on the Node versions supported by the prototype */
// Inlines the scripts into one self-contained fig-viewer.html (no network needed to open a .fig).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = (f) => readFileSync(join(here, 'src', f), 'utf8')
const scripts = ['fzstd.js', 'fig-core.js', 'fig-raster.js', 'fig-render.js', 'viewer.js'].map(
  (f) => {
    const code = src(f)
    if (code.includes('</script')) throw new Error(`${f} contains </script`)
    return `<script>\n${code}\n</script>`
  }
)
const html = src('template.html').replace('<!--SCRIPTS-->', scripts.join('\n'))
writeFileSync(join(here, 'fig-viewer.html'), html)
console.log(`fig-viewer.html ${(html.length / 1024).toFixed(1)} KB`)
