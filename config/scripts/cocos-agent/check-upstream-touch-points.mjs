// Every upstream (stablyai/orca) file cocos-agent modifies must be registered in
// config/cocos-agent/upstream-touch-points.json, and COCOS-AGENT.md's touch-point table is generated
// from that file. A merge that drops a hook must not pass by deleting its entry: entries the
// previous registry had stay registered or are retired with a reason and the replacement, if any.
// Usage: node config/scripts/cocos-agent/check-upstream-touch-points.mjs [--write-doc] [--base <sha>] [--previous <ref>]
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

/** Registered files that no longer differ from upstream: their Cocos change is gone. */
export function findStale(changed, entries) {
  const changedPaths = new Set(changed.map((entry) => entry.path))
  return entries.filter((entry) => !changedPaths.has(entry.path)).map((entry) => entry.path)
}

function findDropped(previousEntries, entries, retired) {
  const paths = new Set(entries.map((entry) => entry.path))
  const retiredPaths = new Set(retired.map((entry) => entry.path))
  return previousEntries.filter((entry) => !paths.has(entry.path) && !retiredPaths.has(entry.path))
}

export function renderTouchPointsTable(entries, mirrors = [], retired = []) {
  const rows = [...entries]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(
      (entry) =>
        `| \`${entry.path}\` | ${KIND_LABELS[entry.kind] ?? entry.kind} | ${entry.change} | ${entry.onConflict} |`
    )
  const mirrorRows = [...mirrors]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((mirror) => `| \`${mirror.path}\` | \`${mirror.mirrorOf}\` | ${mirror.note} |`)
  const retiredRows = [...retired]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((entry) => `| \`${entry.path}\` | ${entry.change} | ${entry.reason} |`)
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
    ...(retiredRows.length
      ? [
          '',
          '已退役的挂点（有意不再改上游，合并时不用接回）：',
          '',
          '| 原文件 | 原改动 | 退役原因 |',
          '| --- | --- | --- |',
          ...retiredRows
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

export function validateRetired(retired, entries) {
  const problems = []
  const registered = new Set(entries.map((entry) => entry.path))
  for (const entry of retired) {
    for (const field of ['path', 'change', 'reason']) {
      if (typeof entry[field] !== 'string' || entry[field].length === 0) {
        problems.push(`retired ${entry.path ?? '?'}: missing ${field}`)
      }
    }
    if (registered.has(entry.path)) {
      problems.push(`${entry.path}: both registered and retired`)
    }
  }
  return problems
}

function readJson(file) {
  return JSON.parse(readFileSync(path.join(repoRoot, file), 'utf8'))
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag)
  return index === -1 ? undefined : argv[index + 1]
}

export function main(argv = process.argv.slice(2)) {
  const base = argValue(argv, '--base') ?? readJson(UPSTREAM_BASE_PATH).upstreamSha
  const previous = argValue(argv, '--previous')
  const writeDoc = argv.includes('--write-doc')
  const { entries, mirrors = [], retired = [] } = readJson(TOUCH_POINTS_PATH)
  const onConflict = new Map(entries.map((entry) => [entry.path, entry.onConflict]))
  const problems = [...validateEntries(entries), ...validateRetired(retired, entries)]
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
        `${file}: registered but identical to upstream, so its Cocos change is gone; re-apply it (${onConflict.get(file)}), or move the entry to "retired" with a reason if it is no longer needed`
      )
    }
  } else {
    problems.push(
      `upstream base ${base} is not in this clone; fetch the recorded upstream commit before checking`
    )
  }
  let previousRegistry = null
  if (previous) {
    let previousCommit
    try {
      previousCommit = git(['rev-parse', '--verify', '--quiet', `${previous}^{commit}`]).trim()
    } catch {
      problems.push(`previous Cocos ref ${previous} is not in this clone`)
    }
    if (previousCommit && git(['ls-tree', previousCommit, '--', TOUCH_POINTS_PATH]).length > 0) {
      previousRegistry = JSON.parse(git(['show', `${previousCommit}:${TOUCH_POINTS_PATH}`]))
    }
  }
  for (const entry of findDropped(previousRegistry?.entries ?? [], entries, retired)) {
    problems.push(
      `${entry.path}: registered at ${previous.slice(0, 11)} but dropped without a "retired" record; a merge probably lost its Cocos change (${entry.change}). Re-apply it (${entry.onConflict}) or retire it with a reason`
    )
  }
  const table = renderTouchPointsTable(entries, mirrors, retired)
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
