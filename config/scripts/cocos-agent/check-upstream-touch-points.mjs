// Every upstream (stablyai/orca) file cocos-agent modifies must be registered in
// config/cocos-agent/upstream-touch-points.json, and COCOS-AGENT.md's touch-point table is generated
// from that file. Usage: node config/scripts/cocos-agent/check-upstream-touch-points.mjs [--write-doc] [--base <sha>]
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const repoRoot = path.resolve(import.meta.dirname, '../../..')
export const TOUCH_POINTS_PATH = 'config/cocos-agent/upstream-touch-points.json'
export const UPSTREAM_BASE_PATH = 'config/cocos-agent/upstream-base.json'
export const DOC_PATH = 'COCOS-AGENT.md'
const DOC_START = '<!-- touch-points:start -->'
const DOC_END = '<!-- touch-points:end -->'
const KIND_LABELS = {
  hook: '挂点',
  brand: '品牌',
  enum: '枚举',
  mirror: '镜像',
  'upstream-candidate': '待回馈上游'
}

/** Paths from `git diff --name-status` that upstream also has: modified, deleted or renamed (added files cannot conflict). */
export function changedUpstreamFiles(nameStatus) {
  return nameStatus
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split('\t')
      return { status: status[0], path: paths.at(-1) }
    })
    .filter((entry) => entry.status !== 'A')
}

export function findUnregistered(changed, entries) {
  const registered = new Set(entries.map((entry) => entry.path))
  return changed.filter((entry) => !registered.has(entry.path)).map((entry) => entry.path)
}

/** Registered files that no longer differ from upstream: the registry must not list ghosts. */
export function findStale(changed, entries) {
  const changedPaths = new Set(changed.map((entry) => entry.path))
  return entries.filter((entry) => !changedPaths.has(entry.path)).map((entry) => entry.path)
}

export function renderTouchPointsTable(entries, mirrors = []) {
  const rows = [...entries]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(
      (entry) =>
        `| \`${entry.path}\` | ${KIND_LABELS[entry.kind] ?? entry.kind} | ${entry.change} | ${entry.onConflict} |`
    )
  const mirrorRows = [...mirrors]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((mirror) => `| \`${mirror.path}\` | \`${mirror.mirrorOf}\` | ${mirror.note} |`)
  // The formatter would pad the generated columns; keep the section byte-stable instead.
  return [
    '<!-- prettier-ignore-start -->',
    '| 文件 | 类型 | 改动 | 冲突时 |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    `共 ${entries.length} 个上游文件。由 \`node config/scripts/cocos-agent/check-upstream-touch-points.mjs --write-doc\` 生成，请改 \`${TOUCH_POINTS_PATH}\`。`,
    ...(mirrorRows.length
      ? [
          '',
          '自有文件中复制自上游的逻辑（上游改了来源时要对比）：',
          '',
          '| 自有文件 | 镜像自 | 说明 |',
          '| --- | --- | --- |',
          ...mirrorRows
        ]
      : []),
    '<!-- prettier-ignore-end -->'
  ].join('\n')
}

export function replaceDocSection(doc, table) {
  const start = doc.indexOf(DOC_START)
  const end = doc.indexOf(DOC_END)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${DOC_PATH} needs ${DOC_START} and ${DOC_END} markers`)
  }
  return `${doc.slice(0, start + DOC_START.length)}\n\n${table}\n\n${doc.slice(end)}`
}

export function validateEntries(entries) {
  const problems = []
  const seen = new Set()
  for (const entry of entries) {
    for (const field of ['path', 'kind', 'change', 'onConflict']) {
      if (typeof entry[field] !== 'string' || entry[field].length === 0) {
        problems.push(`${entry.path ?? '?'}: missing ${field}`)
      }
    }
    if (!(entry.kind in KIND_LABELS)) {
      problems.push(`${entry.path}: unknown kind ${entry.kind}`)
    }
    if (seen.has(entry.path)) {
      problems.push(`${entry.path}: listed twice`)
    }
    seen.add(entry.path)
  }
  return problems
}

function readJson(file) {
  return JSON.parse(readFileSync(path.join(repoRoot, file), 'utf8'))
}

export function main(argv = process.argv.slice(2)) {
  const baseIndex = argv.indexOf('--base')
  const base = baseIndex === -1 ? readJson(UPSTREAM_BASE_PATH).upstreamSha : argv[baseIndex + 1]
  const writeDoc = argv.includes('--write-doc')
  const { entries, mirrors = [] } = readJson(TOUCH_POINTS_PATH)
  const problems = validateEntries(entries)
  for (const mirror of mirrors) {
    for (const field of ['path', 'mirrorOf', 'note']) {
      if (typeof mirror[field] !== 'string' || mirror[field].length === 0) {
        problems.push(`mirror ${mirror.path ?? '?'}: missing ${field}`)
      }
    }
  }
  const git = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  let baseAvailable = true
  try {
    git(['cat-file', '-e', `${base}^{commit}`])
  } catch {
    baseAvailable = false
  }
  if (baseAvailable) {
    const changed = changedUpstreamFiles(git(['diff', '--name-status', '--diff-filter=MDR', base]))
    for (const file of findUnregistered(changed, entries)) {
      problems.push(`${file}: upstream file changed but not registered in ${TOUCH_POINTS_PATH}`)
    }
    for (const file of findStale(changed, entries)) {
      problems.push(
        `${file}: registered but identical to upstream; remove it from ${TOUCH_POINTS_PATH}`
      )
    }
  } else {
    console.warn(
      `[cocos-agent] upstream base ${base} is not in this clone (shallow checkout?); only the registry and the doc were checked`
    )
  }
  const table = renderTouchPointsTable(entries, mirrors)
  const docFile = path.join(repoRoot, DOC_PATH)
  const doc = readFileSync(docFile, 'utf8')
  const expected = replaceDocSection(doc, table)
  if (expected !== doc) {
    if (writeDoc) {
      writeFileSync(docFile, expected)
      console.log(`[cocos-agent] ${DOC_PATH} touch-point table updated`)
    } else {
      problems.push(`${DOC_PATH}: touch-point table is out of date; run with --write-doc`)
    }
  }
  if (problems.length > 0) {
    console.error('[cocos-agent] upstream touch points:')
    for (const problem of problems) {
      console.error(`  ${problem}`)
    }
    return 1
  }
  const verified = baseAvailable ? ` and verified against ${base.slice(0, 11)}` : ''
  console.log(`[cocos-agent] ${entries.length} upstream touch points registered${verified}`)
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main()
}
