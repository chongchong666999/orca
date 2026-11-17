/* oxlint-disable eslint/curly, eslint/no-unused-vars, eslint/prefer-template, unicorn/no-new-array -- browser and Node compatibility decoder */
/* fig-core.js — reads a saved Figma file (.fig ZIP or bare fig-kiwi): container, the kiwi schema embedded in the
 * file, a node index built in one pass, and on-demand decoding of single nodes. Runs in browsers and in Node. */
;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.FigCore = api
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict'
  const u16 = (b, o) => b[o] | (b[o + 1] << 8)
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
  const td = new TextDecoder()
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const gk = (g) => g.sessionID + ':' + g.localID

  // ZIP central directory (stored or deflated entries; files under 4 GB).
  async function openZip(reader) {
    const tailLen = Math.min(reader.size, 65557)
    const tail = await reader.read(reader.size - tailLen, tailLen)
    let e = -1
    for (let i = tail.length - 22; i >= 0; i--)
      if (u32(tail, i) === 0x06054b50) {
        e = i
        break
      }
    if (e < 0) throw new Error('不是有效的 ZIP：找不到目录记录')
    const count = u16(tail, e + 10),
      cdSize = u32(tail, e + 12),
      cdOff = u32(tail, e + 16)
    const cd = await reader.read(cdOff, cdSize)
    const entries = new Map()
    for (let p = 0, k = 0; k < count && p + 46 <= cd.length && u32(cd, p) === 0x02014b50; k++) {
      const nlen = u16(cd, p + 28),
        xlen = u16(cd, p + 30),
        clen = u16(cd, p + 32)
      entries.set(td.decode(cd.subarray(p + 46, p + 46 + nlen)), {
        method: u16(cd, p + 10),
        csize: u32(cd, p + 20),
        usize: u32(cd, p + 24),
        lho: u32(cd, p + 42)
      })
      p += 46 + nlen + xlen + clen
    }
    return entries
  }

  async function entryRange(reader, ent) {
    const lh = await reader.read(ent.lho, 30)
    if (u32(lh, 0) !== 0x04034b50) throw new Error('ZIP 文件头损坏')
    return { start: ent.lho + 30 + u16(lh, 26) + u16(lh, 28), size: ent.csize, method: ent.method }
  }

  // Binary kiwi schema → definitions with field-id lookups.
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
  function parseSchema(d) {
    let i = 0
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
      const s = td.decode(d.subarray(st, i))
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
    const defs = new Map()
    for (const r of raw) {
      const fields = r.fields.map((f) => ({
        name: f.name,
        isArray: f.isArray,
        value: f.value,
        type: r.kind === 0 ? null : f.type < 0 ? PRIM[f.type] : raw[f.type].name
      }))
      const def = {
        name: r.name,
        kind: KIND[r.kind],
        fields,
        byId: new Map(fields.map((f) => [f.value, f]))
      }
      if (def.kind === 'ENUM') def.enumNames = new Map(fields.map((f) => [f.value, f.name]))
      defs.set(r.name, def)
    }
    return defs
  }

  // Decoder positioned anywhere in the message buffer; also skips values without allocating.
  function makeDecoder(defs, B) {
    let p = 0
    const f32 = new Float32Array(1),
      u32a = new Uint32Array(f32.buffer)
    const vu = () => {
      let v = 0,
        s = 0,
        b
      do {
        b = B[p++]
        v |= (b & 127) << s
        s += 7
      } while (b & 128 && s < 35)
      return v >>> 0
    }
    const vi = () => {
      const v = vu()
      return v & 1 ? ~(v >>> 1) : v >>> 1
    }
    const v64 = () => {
      let v = 0,
        s = 0,
        b
      while ((b = B[p++]) & 128 && s < 56) {
        v += (b & 127) * 2 ** s
        s += 7
      }
      return v + b * 2 ** s
    }
    const skip64 = () => {
      let s = 0
      while (B[p++] & 128 && s < 56) s += 7
    }
    const str = () => {
      const st = p
      let ascii = true
      while (B[p] !== 0) {
        if (B[p] & 0x80) ascii = false
        p++
      }
      let s
      if (ascii && p - st < 48) {
        s = ''
        for (let k = st; k < p; k++) s += String.fromCharCode(B[k])
      } else s = td.decode(B.subarray(st, p))
      p++
      return s
    }
    const fl = () => {
      const a = B[p++]
      if (a === 0) return 0
      const bits = a | (B[p++] << 8) | (B[p++] << 16) | (B[p++] << 24)
      u32a[0] = (bits << 23) | (bits >>> 9)
      return f32[0]
    }
    function one(type) {
      switch (type) {
        case 'bool':
          return B[p++] !== 0
        case 'byte':
          return B[p++]
        case 'int':
          return vi()
        case 'uint':
          return vu()
        case 'float':
          return fl()
        case 'string':
          return str()
        case 'int64': {
          const v = v64()
          return v % 2 ? -(v + 1) / 2 : v / 2
        }
        case 'uint64':
          return v64()
      }
      const d = defs.get(type)
      if (d.kind === 'ENUM') {
        const v = vu()
        const nm = d.enumNames.get(v)
        return nm === undefined ? v : nm
      }
      if (d.kind === 'STRUCT') {
        const o = {}
        for (const f of d.fields) o[f.name] = field(f)
        return o
      }
      const o = {}
      for (;;) {
        const id = vu()
        if (id === 0) return o
        const f = d.byId.get(id)
        if (!f) throw new Error('未知字段 ' + id + '（' + type + '）')
        o[f.name] = field(f)
      }
    }
    function field(f) {
      if (f.isArray) {
        if (f.type === 'byte') {
          const n = vu()
          const o = B.subarray(p, p + n)
          p += n
          return o
        }
        const n = vu(),
          a = new Array(n)
        for (let k = 0; k < n; k++) a[k] = one(f.type)
        return a
      }
      return one(f.type)
    }
    function skipOne(type) {
      switch (type) {
        case 'bool':
        case 'byte':
          p++
          return
        case 'int':
        case 'uint':
          while (B[p++] & 128);
          return
        case 'float':
          if (B[p++] !== 0) p += 3
          return
        case 'string':
          while (B[p] !== 0) p++
          p++
          return
        case 'int64':
        case 'uint64':
          skip64()
          return
      }
      const d = defs.get(type)
      if (d.kind === 'ENUM') {
        while (B[p++] & 128);
        return
      }
      if (d.kind === 'STRUCT') {
        for (const f of d.fields) skipField(f)
        return
      }
      for (;;) {
        const id = vu()
        if (id === 0) return
        skipField(d.byId.get(id))
      }
    }
    function skipField(f) {
      if (f.isArray) {
        const n = vu()
        if (f.type === 'byte') {
          p += n
          return
        }
        for (let k = 0; k < n; k++) skipOne(f.type)
        return
      }
      skipOne(f.type)
    }
    return {
      get p() {
        return p
      },
      set p(v) {
        p = v
      },
      vu,
      one,
      field,
      skipField
    }
  }

  // One pass over the message: per node only guid, parent, order, type, name and visibility, plus byte offsets for
  // decoding later; blobs are recorded as offsets into the same buffer, never copied.
  function buildIndex(defs, msg) {
    const D = makeDecoder(defs, msg)
    const mDef = defs.get('Message'),
      ncDef = defs.get('NodeChange')
    let keys = [],
      parents = [],
      positions = [],
      types = [],
      names = [],
      hidden = [],
      offsets = new Uint32Array(0)
    let blobOff = new Uint32Array(0),
      blobLen = new Uint32Array(0),
      n = 0
    D.p = 0
    for (;;) {
      const id = D.vu()
      if (id === 0) break
      const f = mDef.byId.get(id)
      if (f.name === 'nodeChanges') {
        n = D.vu()
        offsets = new Uint32Array(n)
        keys = new Array(n)
        parents = new Array(n)
        positions = new Array(n)
        types = new Array(n)
        names = new Array(n)
        hidden = new Uint8Array(n)
        for (let k = 0; k < n; k++) {
          offsets[k] = D.p
          let key = '',
            pkey = '',
            pos = '',
            type = '',
            name = '',
            vis = true
          for (;;) {
            const fid = D.vu()
            if (fid === 0) break
            const ff = ncDef.byId.get(fid)
            switch (ff.name) {
              case 'guid':
                key = gk(D.one('GUID'))
                break
              case 'parentIndex': {
                const pi = D.one('ParentIndex')
                if (pi.guid) pkey = gk(pi.guid)
                pos = pi.position || ''
                break
              }
              case 'type':
                type = D.field(ff)
                break
              case 'name':
                name = D.field(ff)
                break
              case 'visible':
                vis = D.field(ff)
                break
              default:
                D.skipField(ff)
            }
          }
          keys[k] = key
          parents[k] = pkey
          positions[k] = pos
          types[k] = type
          names[k] = name
          hidden[k] = vis === false ? 1 : 0
        }
      } else if (f.name === 'blobs') {
        const count = D.vu()
        blobOff = new Uint32Array(count)
        blobLen = new Uint32Array(count)
        const bdef = defs.get(f.type)
        for (let k = 0; k < count; k++) {
          if (bdef.kind === 'STRUCT') {
            const len = D.vu()
            blobOff[k] = D.p
            blobLen[k] = len
            D.p = D.p + len
            continue
          }
          for (;;) {
            const fid = D.vu()
            if (fid === 0) break
            const ff = bdef.byId.get(fid)
            if (ff.name === 'bytes') {
              const len = D.vu()
              blobOff[k] = D.p
              blobLen[k] = len
              D.p = D.p + len
            } else D.skipField(ff)
          }
        }
      } else D.skipField(f)
    }
    const idxOf = new Map()
    for (let i = 0; i < n; i++) idxOf.set(keys[i], i)
    const parentIdx = new Int32Array(n).fill(-1),
      kids = new Array(n)
    for (let i = 0; i < n; i++) {
      const pi = idxOf.get(parents[i])
      if (pi !== undefined && pi !== i) {
        parentIdx[i] = pi
        ;(kids[pi] || (kids[pi] = [])).push(i)
      }
    }
    // Siblings sorted by fractional-index position: back to front, the order they are drawn in.
    for (const a of kids)
      if (a && a.length > 1)
        a.sort((x, y) => (positions[x] < positions[y] ? -1 : positions[x] > positions[y] ? 1 : 0))
    return {
      n,
      keys,
      names,
      types,
      hidden,
      positions,
      parentIdx,
      kids,
      idxOf,
      offsets,
      blobOff,
      blobLen
    }
  }

  class FigDoc {
    constructor(o) {
      Object.assign(this, o)
      this.D = makeDecoder(this.defs, this.msg)
      this.cache = new Map()
    }
    node(i) {
      let n = this.cache.get(i)
      if (n) return n
      this.D.p = this.index.offsets[i]
      n = this.D.one('NodeChange')
      this.cache.set(i, n)
      return n
    }
    children(i) {
      return this.index.kids[i] || []
    }
    idx(key) {
      return this.index.idxOf.get(key)
    }
    blob(k) {
      if (k == null || k >= this.index.blobOff.length) return null
      const o = this.index.blobOff[k]
      return this.msg.subarray(o, o + this.index.blobLen[k])
    }
    documentIdx() {
      return this.index.types.indexOf('DOCUMENT')
    }
    pages() {
      return this.children(this.documentIdx()).filter((i) => this.index.types[i] === 'CANVAS')
    }
    pageOf(i) {
      const t = this.index.types,
        p = this.index.parentIdx
      while (i >= 0 && t[i] !== 'CANVAS') i = p[i]
      return i
    }
    // Bytes (or a Blob slice in browsers) of images/<sha1> from the ZIP; null when the saved copy left it out.
    async imageSource(hex) {
      if (!this.entries) return null
      const ent = this.entries.get('images/' + hex)
      if (!ent) return null
      const r = await entryRange(this.reader, ent)
      if (r.method === 0 && this.reader.slice) return this.reader.slice(r.start, r.size)
      let bytes = await this.reader.read(r.start, r.size)
      if (r.method === 8) bytes = await this.codecs.inflateRaw(bytes)
      return bytes
    }
  }

  async function openFig(reader, codecs, onStep) {
    const steps = []
    const mark = (name, t0, extra) => {
      steps.push(Object.assign({ name, ms: Math.round(now() - t0) }, extra || {}))
      if (onStep) onStep(steps.slice())
    }
    let t = now()
    const head = await reader.read(0, 8)
    let entries = null,
      meta = null,
      canvas
    if (u32(head, 0) === 0x04034b50) {
      entries = await openZip(reader)
      const ent = entries.get('canvas.fig')
      if (!ent) throw new Error('ZIP 里没有 canvas.fig')
      const r = await entryRange(reader, ent)
      canvas = await reader.read(r.start, r.size)
      if (r.method === 8) canvas = await codecs.inflateRaw(canvas)
      const me = entries.get('meta.json')
      if (me) {
        try {
          const mr = await entryRange(reader, me)
          let mb = await reader.read(mr.start, mr.size)
          if (mr.method === 8) mb = await codecs.inflateRaw(mb)
          meta = JSON.parse(td.decode(mb))
        } catch (e) {
          meta = null
        }
      }
    } else canvas = await reader.read(0, reader.size)
    mark('读取 canvas.fig', t, { bytes: canvas.length })
    if (td.decode(canvas.subarray(0, 8)) !== 'fig-kiwi') throw new Error('不是 fig-kiwi 文件')
    const version = u32(canvas, 8),
      chunks = []
    for (let off = 12; off + 4 <= canvas.length;) {
      const n = u32(canvas, off)
      chunks.push(canvas.subarray(off + 4, off + 4 + n))
      off += 4 + n
    }
    const unpack = (c) =>
      c.length >= 4 && u32(c, 0) === 0xfd2fb528 ? codecs.zstd(c) : codecs.inflateRaw(c)
    t = now()
    const defs = parseSchema(await unpack(chunks[0]))
    mark('读取文件自带的格式说明', t, { definitions: defs.size })
    t = now()
    const msg = await unpack(chunks[1])
    mark('解压', t, { bytes: msg.length })
    t = now()
    const index = buildIndex(defs, msg)
    mark('建目录', t, { nodes: index.n, blobs: index.blobOff.length })
    return new FigDoc({ defs, msg, index, entries, reader, codecs, version, meta, steps })
  }

  return { openFig, parseSchema, makeDecoder, buildIndex, gk }
})
