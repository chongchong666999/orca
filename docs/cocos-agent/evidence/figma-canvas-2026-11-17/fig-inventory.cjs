/* oxlint-disable eslint/curly, unicorn/prefer-node-protocol -- read-only evidence decoder keeps compact parsing loops */
// Usage: node fig-inventory.cjs <dir holding canvas.fig and images/>
// Decodes a saved Figma file (fig-kiwi) with the schema embedded in the file itself and prints what a renderer and a
// Cocos importer would get from it. Read-only.
const fs = require('fs'),
  path = require('path'),
  zlib = require('zlib')
const { compile } = require('./kiwi-decode.cjs')
const dir = process.argv[2]
const fig = fs.readFileSync(path.join(dir, 'canvas.fig'))
if (fig.subarray(0, 8).toString() !== 'fig-kiwi') throw new Error('not a fig-kiwi file')
const chunks = []
for (let off = 12; off + 4 <= fig.length;) {
  const n = fig.readUInt32LE(off)
  chunks.push(fig.subarray(off + 4, off + 4 + n))
  off += 4 + n
}
const inflate = (c) =>
  c.readUInt32LE(0) === 0xfd2fb528 ? zlib.zstdDecompressSync(c) : zlib.inflateRawSync(c)
const [schemaBytes, messageBytes] = chunks.map(inflate)
// Binary kiwi schema -> the JSON shape kiwi-decode.cjs takes.
const PRIM = {
  '-1': 'bool',
  '-2': 'byte',
  '-3': 'int',
  '-4': 'uint',
  '-5': 'float',
  '-6': 'string',
  '-7': 'int64',
  '-8': 'uint64'
}
let i = 0
const d = schemaBytes
const vu = () => {
  let v = 0,
    s = 0,
    b
  do {
    b = d[i++]
    v |= (b & 127) << s
    s += 7
  } while (b & 128)
  return v >>> 0
}
const vi = () => {
  const v = vu()
  return v & 1 ? ~(v >>> 1) : v >>> 1
}
const str = () => {
  const st = i
  while (d[i] !== 0) i++
  const s = d.subarray(st, i).toString()
  i++
  return s
}
const raw = []
for (let k = vu(); k > 0; k--) {
  const name = str(),
    kind = d[i++],
    fields = []
  for (let j = vu(); j > 0; j--)
    fields.push({ name: str(), type: vi(), isArray: d[i++] === 1, value: vu() })
  raw.push({ name, kind, fields })
}
const KIND = ['ENUM', 'STRUCT', 'MESSAGE']
const schema = {
  definitions: raw.map((r) => ({
    name: r.name,
    kind: KIND[r.kind],
    fields: r.fields.map((f) => ({
      ...f,
      type: r.kind === 0 ? null : f.type < 0 ? PRIM[f.type] : raw[f.type].name
    }))
  }))
}
const t0 = Date.now()
const msg = compile(schema).decode('Message', messageBytes)
const decodeMs = Date.now() - t0
const nodes = msg.nodeChanges,
  key = (g) => g && `${g.sessionID}:${g.localID}`,
  byId = new Map(nodes.map((n) => [key(n.guid), n]))
const count = (m, k) => m.set(k, (m.get(k) || 0) + 1),
  top = (m, n = 20) =>
    [...m]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')
const types = new Map(),
  paints = new Map(),
  effects = new Map(),
  blends = new Map(),
  stack = new Map(),
  prefixes = new Map(),
  fonts = new Map(),
  derived = new Map()
let glyphs = 0,
  fillGeo = 0,
  strokeGeo = 0,
  withDerived = 0,
  symbolsResolved = 0,
  nineSlice = 0
for (const n of nodes) {
  count(types, n.type)
  if (n.fillGeometry?.length) fillGeo++
  if (n.strokeGeometry?.length) strokeGeo++
  if (n.type === 'TEXT') {
    if (n.derivedTextData?.glyphs?.length) glyphs++
    if (n.fontName) count(fonts, `${n.fontName.family} ${n.fontName.style}`)
  }
  if (n.type === 'INSTANCE') {
    if (byId.get(key(n.symbolData?.symbolID))?.type === 'SYMBOL') symbolsResolved++
    if (n.derivedSymbolData?.length) withDerived++
  }
  for (const r of n.derivedSymbolData || [])
    for (const k of Object.keys(r)) if (k !== 'guidPath') count(derived, k)
  for (const p of n.fillPaints || []) if (p.visible !== false) count(paints, p.type)
  for (const e of n.effects || []) if (e.visible !== false) count(effects, `${e.type}@${n.type}`)
  if (n.blendMode && !['NORMAL', 'PASS_THROUGH'].includes(n.blendMode)) count(blends, n.blendMode)
  if (n.stackMode && n.stackMode !== 'NONE') count(stack, n.stackMode)
  const m = (n.name || '').match(/^([a-zA-Z0-9]+)_/)
  if (m) count(prefixes, m[1].toLowerCase())
  if (/^9slice/i.test(n.name || '')) nineSlice++
}
const images = new Set(
    fs.existsSync(path.join(dir, 'images')) ? fs.readdirSync(path.join(dir, 'images')) : []
  ),
  hashes = new Set()
for (const n of nodes)
  for (const p of [...(n.fillPaints || []), ...(n.strokePaints || [])])
    if (p.type === 'IMAGE' && p.image?.hash) hashes.add(Buffer.from(p.image.hash).toString('hex'))
const inst = types.get('INSTANCE') || 0,
  text = types.get('TEXT') || 0
console.log(
  `fig-kiwi v${fig.readUInt32LE(8)}; chunks ${chunks.map((c) => c.length).join(' + ')} B; schema ${schema.definitions.length} definitions (NodeChange ${schema.definitions.find((x) => x.name === 'NodeChange').fields.length} fields)`
)
console.log(
  `message ${messageBytes.length} B decoded in ${decodeMs} ms: ${nodes.length} nodes, ${msg.blobs.length} blobs`
)
console.log(`types: ${top(types)}`)
console.log(`TEXT with glyph outlines: ${glyphs}/${text}; fonts: ${top(fonts, 10)}`)
console.log(`fillGeometry nodes ${fillGeo}, strokeGeometry nodes ${strokeGeo}`)
console.log(
  `INSTANCE ${inst}: component found in file ${symbolsResolved}, with derivedSymbolData ${withDerived}; derived fields: ${top(derived)}`
)
console.log(
  `visible fills: ${top(paints)}; visible effects: ${top(effects, 12)}; non-normal blends: ${top(blends) || 'none'}; auto layout: ${top(stack)}`
)
console.log(`name prefixes: ${top(prefixes, 15)}; 9slice layers: ${nineSlice}`)
console.log(
  `image hashes referenced ${hashes.size}, present in images/ ${[...hashes].filter((h) => images.has(h)).length}`
)
