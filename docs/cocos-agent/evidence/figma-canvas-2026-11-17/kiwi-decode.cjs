/* oxlint-disable eslint/curly, eslint/prefer-template, unicorn/no-new-array -- read-only schema decoder keeps compact binary parsing */
// Minimal kiwi decoder for a parsed schema JSON (evanw/kiwi format)
class BB {
  constructor(u8) {
    this.d = u8
    this.i = 0
    this.f32 = new Float32Array(1)
    this.u32 = new Uint32Array(this.f32.buffer)
  }
  byte() {
    if (this.i >= this.d.length) throw new Error('EOF')
    return this.d[this.i++]
  }
  bool() {
    return this.byte() !== 0
  }
  vu() {
    let v = 0,
      s = 0,
      b
    do {
      b = this.byte()
      v |= (b & 127) << s
      s += 7
    } while (b & 128 && s < 35)
    return v >>> 0
  }
  vi() {
    const v = this.vu()
    return v & 1 ? ~(v >>> 1) : v >>> 1
  }
  vu64() {
    let v = 0n,
      s = 0n,
      b
    do {
      b = this.byte()
      v |= BigInt(b & 127) << s
      s += 7n
    } while (b & 128 && s < 63n)
    if (b & 128) v |= BigInt(this.byte()) << s
    return v
  }
  vi64() {
    const v = this.vu64()
    return v & 1n ? ~(v >> 1n) : v >> 1n
  }
  fl() {
    const f = this.byte()
    if (f === 0) return 0
    const b = f | (this.byte() << 8) | (this.byte() << 16) | (this.byte() << 24)
    this.u32[0] = (b << 23) | (b >>> 9)
    return this.f32[0]
  }
  str() {
    const st = this.i
    while (this.d[this.i] !== 0) this.i++
    const s = Buffer.from(this.d.subarray(st, this.i)).toString('utf8')
    this.i++
    return s
  }
  bytes() {
    const n = this.vu()
    const o = this.d.subarray(this.i, this.i + n)
    this.i += n
    return o
  }
}
function compile(schema) {
  const defs = new Map(schema.definitions.map((d) => [d.name, d]))
  const prim = {
    bool: (b) => b.bool(),
    byte: (b) => b.byte(),
    int: (b) => b.vi(),
    uint: (b) => b.vu(),
    float: (b) => b.fl(),
    string: (b) => b.str(),
    int64: (b) => b.vi64(),
    uint64: (b) => b.vu64()
  }
  function field(b, f) {
    if (f.isArray) {
      if (f.type === 'byte') return b.bytes()
      const n = b.vu()
      const a = new Array(n)
      for (let k = 0; k < n; k++) a[k] = one(b, f.type)
      return a
    }
    return one(b, f.type)
  }
  function one(b, t) {
    const p = prim[t]
    if (p) return p(b)
    const d = defs.get(t)
    if (!d) throw new Error('unknown type ' + t)
    if (d.kind === 'ENUM') {
      const v = b.vu()
      const e = d.fields.find((x) => x.value === v)
      return e ? e.name : v
    }
    if (d.kind === 'STRUCT') {
      const o = {}
      for (const f of d.fields) o[f.name] = field(b, f)
      return o
    }
    const o = {}
    const byId = d._byId || (d._byId = new Map(d.fields.map((x) => [x.value, x])))
    for (;;) {
      const id = b.vu()
      if (id === 0) return o
      const f = byId.get(id)
      if (!f) throw new Error(`bad field ${id} in ${t} @${b.i}`)
      o[f.name] = field(b, f)
    }
  }
  return {
    decode(type, u8) {
      return one(new BB(u8), type)
    }
  }
}
module.exports = { compile }
