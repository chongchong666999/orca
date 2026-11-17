/* oxlint-disable eslint/curly, eslint/prefer-template, unicorn/no-zero-fractions, unicorn/prefer-at, unicorn/prefer-number-properties -- renderer mirrors recovered browser formulas */
/* fig-render.js — draws one node of a FigDoc with Canvas 2D plus CPU passes, following the formulas recovered
 * from Figma's renderer: 4-sample path coverage and the image pyramid (fig-raster.js), premultiplied blend modes,
 * separable triangle-kernel blur (w(i) = max(count - |i|, 0)), drop / inner shadows from the layer's alpha, image scale
 * modes, and text from the glyph outlines stored in the file. Component instances are expanded from their main
 * component with symbolOverrides and derivedSymbolData applied. */
;(function (root, factory) {
  const node = typeof module !== 'undefined' && module.exports
  const api = factory(node ? require('./fig-raster.js') : root.FigRaster)
  if (node) module.exports = api
  else root.FigRender = api
})(typeof self !== 'undefined' ? self : this, function (Raster) {
  'use strict'
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  // Every canvas here is read back (masks, effects, image pixels); keep them on the CPU in browsers.
  const RW = { willReadFrequently: true }
  const gk = (g) => g.sessionID + ':' + g.localID
  const hex = (u8) => {
    let s = ''
    for (let i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16)
    return s
  }
  const bump = (o, k, d = 1) => {
    o[k] = (o[k] || 0) + d
  }

  const GCO = {
    NORMAL: 'source-over',
    PASS_THROUGH: 'source-over',
    DARKEN: 'darken',
    MULTIPLY: 'multiply',
    COLOR_BURN: 'color-burn',
    LIGHTEN: 'lighten',
    SCREEN: 'screen',
    LINEAR_DODGE: 'lighter',
    COLOR_DODGE: 'color-dodge',
    OVERLAY: 'overlay',
    SOFT_LIGHT: 'soft-light',
    HARD_LIGHT: 'hard-light',
    DIFFERENCE: 'difference',
    EXCLUSION: 'exclusion',
    HUE: 'hue',
    SATURATION: 'saturation',
    COLOR: 'color',
    LUMINOSITY: 'luminosity'
  }
  // Figma draws an image it cannot load as this translucent grey; the same colour appears in its own exports.
  const MISSING = 'rgba(158,170,186,0.12)'
  const imageKey = (p) =>
    p.image && p.image.hash && p.image.hash.length
      ? hex(p.image.hash)
      : p.image && p.image.dataBlob !== undefined
        ? 'blob:' + p.image.dataBlob
        : null
  const CONTAINERS = new Set(['FRAME', 'GROUP', 'SYMBOL', 'INSTANCE', 'SECTION', 'CANVAS'])
  const SKIP = new Set([
    'SLICE',
    'WIDGET',
    'STAMP',
    'HIGHLIGHT',
    'STICKY',
    'CONNECTOR',
    'CODE_BLOCK',
    'SECTION_OVERLAY',
    'VARIABLE',
    'VARIABLE_SET',
    'CODE_LIBRARY',
    'CODE_FILE',
    'CODE_LAYER',
    'CODE_COMPONENT',
    'CODE_INSTANCE',
    'JSX',
    'WEBPAGE'
  ])

  // 2x3 matrices in canvas order [a, b, c, d, e, f].
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ]
  const fromFig = (t) => (t ? [t.m00, t.m10, t.m01, t.m11, t.m02, t.m12] : [1, 0, 0, 1, 0, 0])
  const inv = (m) => {
    const det = m[0] * m[3] - m[1] * m[2]
    if (!det || !isFinite(det)) return null
    const a = m[3] / det,
      b = -m[1] / det,
      c = -m[2] / det,
      d = m[0] / det
    return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]
  }
  const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))
  const setT = (c, m) => c.setTransform(m[0], m[1], m[2], m[3], m[4], m[5])
  const css = (c, alpha = 1) => {
    const a = (c && c.a !== undefined ? c.a : 1) * alpha
    return (
      'rgba(' +
      ((c ? c.r : 0) * 255).toFixed(3) +
      ',' +
      ((c ? c.g : 0) * 255).toFixed(3) +
      ',' +
      ((c ? c.b : 0) * 255).toFixed(3) +
      ',' +
      a.toFixed(5) +
      ')'
    )
  }

  // Boxes in device pixels {x0, y0, x1, y1}.
  const union = (a, b) =>
    !a
      ? b
      : !b
        ? a
        : {
            x0: Math.min(a.x0, b.x0),
            y0: Math.min(a.y0, b.y0),
            x1: Math.max(a.x1, b.x1),
            y1: Math.max(a.y1, b.y1)
          }
  const boxOf = (m, x0, y0, x1, y1, pad) => {
    const xs = [
      m[0] * x0 + m[2] * y0 + m[4],
      m[0] * x1 + m[2] * y0 + m[4],
      m[0] * x0 + m[2] * y1 + m[4],
      m[0] * x1 + m[2] * y1 + m[4]
    ]
    const ys = [
      m[1] * x0 + m[3] * y0 + m[5],
      m[1] * x1 + m[3] * y0 + m[5],
      m[1] * x0 + m[3] * y1 + m[5],
      m[1] * x1 + m[3] * y1 + m[5]
    ]
    return {
      x0: Math.min(...xs) - pad,
      y0: Math.min(...ys) - pad,
      x1: Math.max(...xs) + pad,
      y1: Math.max(...ys) + pad
    }
  }
  const toRect = (b, W, H, margin) => {
    if (!b) return null
    const x = Math.max(0, Math.floor(b.x0 - margin)),
      y = Math.max(0, Math.floor(b.y0 - margin))
    const x1 = Math.min(W, Math.ceil(b.x1 + margin)),
      y1 = Math.min(H, Math.ceil(b.y1 + margin))
    return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null
  }

  // ---- recovered blur: separable triangle kernel, weights max(r - |i|, 0) ----
  function blur1D(src, w, h, r, horiz, pad) {
    const out = new Float32Array(w * h)
    if (r <= 1) {
      out.set(src)
      return out
    }
    if (r > 24) return boxBox(src, w, h, Math.round(r), horiz, pad)
    const m = Math.ceil(r) - 1,
      wt = new Float32Array(2 * m + 1)
    let sum = 0
    for (let i = -m; i <= m; i++) {
      wt[i + m] = r - Math.abs(i)
      sum += wt[i + m]
    }
    for (let i = 0; i < wt.length; i++) wt[i] /= sum
    if (horiz) {
      for (let y = 0; y < h; y++) {
        const row = y * w
        for (let x = 0; x < w; x++) {
          let acc = 0
          for (let i = -m; i <= m; i++) {
            const xx = x + i
            acc += wt[i + m] * (xx < 0 || xx >= w ? pad : src[row + xx])
          }
          out[row + x] = acc
        }
      }
    } else {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let acc = 0
          for (let i = -m; i <= m; i++) {
            const yy = y + i
            acc += wt[i + m] * (yy < 0 || yy >= h ? pad : src[yy * w + x])
          }
          out[y * w + x] = acc
        }
      }
    }
    return out
  }
  // For large radii: two box filters of width n compose exactly into the triangle with weights n - |i|.
  function boxBox(src, w, h, n, horiz, pad) {
    const a = Math.floor((n - 1) / 2),
      b = Math.ceil((n - 1) / 2)
    const pass = (inp, lo, hi) => {
      const out = new Float32Array(w * h)
      const len = horiz ? w : h,
        lines = horiz ? h : w
      for (let l = 0; l < lines; l++) {
        const get = (i) => (i < 0 || i >= len ? pad : horiz ? inp[l * w + i] : inp[i * w + l])
        let acc = 0
        for (let i = -lo; i <= hi; i++) acc += get(i)
        for (let i = 0; i < len; i++) {
          if (horiz) out[l * w + i] = acc / n
          else out[i * w + l] = acc / n
          acc += get(i + hi + 1) - get(i - lo)
        }
      }
      return out
    }
    return pass(pass(src, a, b), b, a)
  }
  const blurPlane = (P, w, h, r, pad = 0) =>
    r <= 1 ? P : blur1D(blur1D(P, w, h, r, true, pad), w, h, r, false, pad)

  function shift(src, w, h, dx, dy, outside) {
    const out = new Float32Array(w * h)
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? outside : src[y * w + x])
    for (let y = 0; y < h; y++) {
      const sy = y - dy,
        y0 = Math.floor(sy),
        ty = sy - y0
      for (let x = 0; x < w; x++) {
        const sx = x - dx,
          x0 = Math.floor(sx),
          tx = sx - x0
        const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx,
          bot = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx
        out[y * w + x] = top * (1 - ty) + bot * ty
      }
    }
    return out
  }
  function morph(src, w, h, r, dilate) {
    const k = Math.round(r)
    if (k < 1) return src
    const pass = (inp, horiz) => {
      const out = new Float32Array(w * h)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let v = dilate ? 0 : 1
          for (let i = -k; i <= k; i++) {
            const xx = horiz ? x + i : x,
              yy = horiz ? y : y + i
            const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : inp[yy * w + xx]
            v = dilate ? Math.max(v, s) : Math.min(v, s)
          }
          out[y * w + x] = v
        }
      return out
    }
    return pass(pass(src, true), false)
  }

  class Renderer {
    constructor(doc, env) {
      this.doc = doc
      this.env = env // { createCanvas(w, h), loadImage(key) → Promise<image|null>, Path2D, DOMMatrix }
      this.images = new Map()
      this.resampled = new Map()
      this.pyramids = new Map()
      this.paths = new Map()
      // Triangle half-width = blurK × effect radius × device scale. The blur-tile code uses 0.5 × its input radius
      // (f17769 / f25198); the native-export crops fit best at 1.0 against the panel value.
      // aa 'figma' = 4-sample coverage like Figma's multisampled stencil-then-cover; 'canvas' = Canvas 2D's own AA.
      // imageSampling: see drawSampled.
      this.opts = { blurK: 1.0, imageQuality: 'medium', aa: 'figma', imageSampling: 'pyramid' }
    }

    async render(idx, scale, opts) {
      Object.assign(this.opts, opts || {})
      const root = this.doc.node(idx)
      const size = root.size || { x: 100, y: 100 }
      // Every isolated layer is a full-size canvas, so cap both the side and the area.
      const MAX = 8192,
        MAX_AREA = 24e6
      if (size.x * scale > MAX || size.y * scale > MAX) scale = MAX / Math.max(size.x, size.y)
      if (size.x * size.y * scale * scale > MAX_AREA)
        scale = Math.sqrt(MAX_AREA / (size.x * size.y))
      const W = Math.max(1, Math.round(size.x * scale)),
        H = Math.max(1, Math.round(size.y * scale))
      for (let pass = 0; pass < 3; pass++) {
        this.need = new Set()
        const st = {
          nodes: 0,
          layers: 0,
          effects: {},
          unsupported: {},
          missingImages: 0,
          textWithoutGlyphs: 0,
          masks: 0,
          instances: 0,
          errors: []
        }
        const t0 = now()
        const dst = this.layer(W, H)
        try {
          this.drawNode(dst, { idx, n: root, ictx: [] }, [scale, 0, 0, scale, 0, 0], st, true)
        } catch (e) {
          st.errors.push(String((e && e.stack) || e))
        }
        Object.assign(st, { ms: Math.round(now() - t0), scale, width: W, height: H })
        const pending = [...this.need].filter((k) => !this.images.has(k))
        if (!pending.length || pass === 2) return { canvas: dst.canvas, stats: st }
        await Promise.all(
          pending.map((k) =>
            this.env.loadImage(k).then(
              (img) => this.images.set(k, img),
              () => this.images.set(k, null)
            )
          )
        )
      }
    }

    layer(W, H) {
      const canvas = this.env.createCanvas(W, H)
      const ctx = canvas.getContext('2d', RW)
      ctx.imageSmoothingEnabled = true
      if ('imageSmoothingQuality' in ctx)
        ctx.imageSmoothingQuality = this.opts.imageQuality || 'medium'
      return { canvas, ctx, box: null, clip: null }
    }

    drawNode(dst, view, M, st, isRoot) {
      const n = view.n
      if (!isRoot && n.visible === false) return
      if (SKIP.has(n.type)) return
      const opacity = n.opacity === undefined ? 1 : n.opacity
      if (opacity <= 0) return
      st.nodes++
      const L = isRoot ? M : mul(M, fromFig(n.transform))
      const effects = (n.effects || []).filter((e) => e.visible !== false)
      const blend = n.blendMode || (CONTAINERS.has(n.type) ? 'PASS_THROUGH' : 'NORMAL')
      const isolate =
        opacity < 1 || (blend !== 'PASS_THROUGH' && blend !== 'NORMAL') || effects.length > 0
      if (!isolate) {
        this.drawContent(dst, view, L, st)
        return
      }
      const lay = this.layer(dst.canvas.width, dst.canvas.height)
      st.layers++
      this.drawContent(lay, view, L, st)
      if (effects.length) this.applyEffects(lay, dst, effects, L, st)
      this.composite(dst, lay, opacity, blend, st)
    }

    drawContent(dst, view, L, st) {
      const n = view.n,
        size = n.size || { x: 0, y: 0 }
      if (n.type === 'TEXT') {
        this.drawText(dst, n, L, st)
        return
      }
      if (n.fillPaints && n.fillPaints.length) {
        const paths =
          this.geom(n.fillGeometry) ||
          (CONTAINERS.has(n.type) || n.type === 'RECTANGLE' || n.type === 'ROUNDED_RECTANGLE'
            ? [{ path: this.rectPath(n), rule: 'nonzero', rect: this.rectSpec(n) }]
            : null)
        if (paths) for (const p of n.fillPaints) this.paint(dst, paths, p, size, L, st, 0)
      }
      if (n.type !== 'BOOLEAN_OPERATION') {
        const kids = this.childViews(view, st)
        if (kids.length) {
          const clip =
            (n.type === 'FRAME' || n.type === 'SYMBOL' || n.type === 'INSTANCE') &&
            n.frameMaskDisabled === false &&
            !n.resizeToFit
          if (!clip) this.drawChildren(dst, kids, L, st)
          else if (this.opts.aa === 'figma') {
            // Clip on the same four samples as the fills (a stencil clip), so edges are not antialiased twice.
            const E = new Raster.Edges(),
              r = this.rectSpec(n),
              prev = dst.clip
            Raster.addRoundRect(E, r.w, r.h, r.r, L)
            const cov = Raster.coverage(E, false, 0, 0, dst.canvas.width, dst.canvas.height)
            const next = prev ? Raster.intersect(cov, prev) : cov
            if (next) {
              dst.clip = next
              this.drawChildren(dst, kids, L, st)
              dst.clip = prev
            }
          } else {
            dst.ctx.save()
            setT(dst.ctx, L)
            dst.ctx.clip(this.rectPath(n))
            this.drawChildren(dst, kids, L, st)
            dst.ctx.restore()
          }
        }
      }
      if (n.strokePaints && n.strokePaints.length && n.strokeGeometry && n.strokeGeometry.length) {
        const paths = this.geom(n.strokeGeometry)
        if (paths)
          for (const p of n.strokePaints)
            this.paint(dst, paths, p, size, L, st, (n.strokeWeight || 0) + 1)
      }
    }

    drawChildren(dst, kids, L, st) {
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i]
        if (k.n.mask && k.n.visible !== false) {
          // A mask clips every sibling above it, up to the end of the parent.
          st.masks++
          const W = dst.canvas.width,
            H = dst.canvas.height
          const ml = this.layer(W, H),
            cl = this.layer(W, H)
          st.layers += 2
          this.drawNode(
            ml,
            { idx: k.idx, n: Object.assign({}, k.n, { mask: false }), ictx: k.ictx },
            L,
            st
          )
          if (k.n.maskType === 'LUMINANCE') this.luminanceToAlpha(ml)
          for (let j = i + 1; j < kids.length; j++) this.drawNode(cl, kids[j], L, st)
          const c = cl.ctx
          c.save()
          c.setTransform(1, 0, 0, 1, 0, 0)
          c.globalCompositeOperation = 'destination-in'
          c.drawImage(ml.canvas, 0, 0)
          c.restore()
          if (dst.clip) this.clipLayer(cl, dst.clip)
          const d = dst.ctx
          d.save()
          d.setTransform(1, 0, 0, 1, 0, 0)
          d.drawImage(cl.canvas, 0, 0)
          d.restore()
          dst.box = union(dst.box, ml.box)
          return
        }
        this.drawNode(dst, k, L, st)
      }
    }

    // ---- instances: main component children + overrides + derived (laid-out) values ----
    childViews(view, st) {
      const n = view.n
      if (n.type === 'INSTANCE') {
        const sid = n.overriddenSymbolID || (n.symbolData && n.symbolData.symbolID)
        const si = sid ? this.doc.idx(gk(sid)) : undefined
        if (si === undefined) {
          bump(st.unsupported, '实例找不到主组件')
          return []
        }
        st.instances++
        const frame = {
          over: pathMap(n.symbolData && n.symbolData.symbolOverrides),
          der: pathMap(n.derivedSymbolData),
          props: propMap(n.componentPropAssignments),
          path: []
        }
        const ictx = view.ictx.concat([frame])
        return this.doc.children(si).map((ci) => this.resolve(ci, ictx))
      }
      return this.doc.children(view.idx).map((ci) => this.resolve(ci, view.ictx))
    }

    resolve(ci, ictx) {
      const base = this.doc.node(ci)
      if (!ictx.length) return { idx: ci, n: base, ictx }
      const key = this.doc.index.keys[ci]
      const frames = ictx.map((f) => ({
        over: f.over,
        der: f.der,
        props: f.props,
        path: f.path.concat(key)
      }))
      let n = base,
        own = false
      const apply = (o) => {
        n = own ? Object.assign(n, o) : Object.assign({}, n, o)
        own = true
      }
      // Innermost first, so the outer instance's values win; laid-out (derived) values last.
      for (let i = frames.length - 1; i >= 0; i--) {
        const o = frames[i].over && frames[i].over.get(frames[i].path.join('/'))
        if (o) apply(o)
      }
      for (let i = frames.length - 1; i >= 0; i--) {
        const o = frames[i].der && frames[i].der.get(frames[i].path.join('/'))
        if (o) apply(o)
      }
      if (n.componentPropRefs) {
        for (const ref of n.componentPropRefs) {
          if (ref.isDeleted || !ref.defID) continue
          let v
          for (let i = frames.length - 1; i >= 0 && !v; i--)
            v = frames[i].props && frames[i].props.get(gk(ref.defID))
          if (!v) continue
          if (ref.componentPropNodeField === 'VISIBLE' && typeof v.boolValue === 'boolean')
            apply({ visible: v.boolValue })
          else if (ref.componentPropNodeField === 'OVERRIDDEN_SYMBOL_ID' && v.guidValue)
            apply({ overriddenSymbolID: v.guidValue })
        }
      }
      return { idx: ci, n, ictx: frames }
    }

    // ---- geometry ----
    geom(list) {
      if (!list || !list.length) return null
      const out = []
      for (const g of list) {
        const path = this.blobPath(g.commandsBlob)
        if (path)
          out.push({
            path,
            rule: g.windingRule === 'ODD' ? 'evenodd' : 'nonzero',
            blob: this.doc.blob(g.commandsBlob)
          })
      }
      return out.length ? out : null
    }
    rectSpec(n) {
      const w = (n.size && n.size.x) || 0,
        h = (n.size && n.size.y) || 0
      const corners = [
        n.rectangleTopLeftCornerRadius,
        n.rectangleTopRightCornerRadius,
        n.rectangleBottomRightCornerRadius,
        n.rectangleBottomLeftCornerRadius
      ]
      const r = corners.some((v) => v !== undefined)
        ? corners.map((v) => v || 0)
        : [0, 0, 0, 0].map(() => n.cornerRadius || 0)
      return { w, h, r }
    }
    blobPath(k) {
      if (k == null) return null
      let P = this.paths.get(k)
      if (P !== undefined) return P
      const b = this.doc.blob(k)
      if (!b || !b.length) {
        this.paths.set(k, null)
        return null
      }
      P = new this.env.Path2D()
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
      const f = (o) => dv.getFloat32(o, true)
      let o = 0
      while (o < b.length) {
        const c = b[o++]
        if (c === 0) P.closePath()
        else if (c === 1) {
          P.moveTo(f(o), f(o + 4))
          o += 8
        } else if (c === 2) {
          P.lineTo(f(o), f(o + 4))
          o += 8
        } else if (c === 3) {
          P.quadraticCurveTo(f(o), f(o + 4), f(o + 8), f(o + 12))
          o += 16
        } else if (c === 4) {
          P.bezierCurveTo(f(o), f(o + 4), f(o + 8), f(o + 12), f(o + 16), f(o + 20))
          o += 24
        } else break
      }
      this.paths.set(k, P)
      return P
    }
    rectPath(n) {
      const { w, h, r } = this.rectSpec(n)
      const P = new this.env.Path2D()
      if (r.some((v) => v > 0) && P.roundRect)
        P.roundRect(
          0,
          0,
          w,
          h,
          r.map((v) => Math.max(0, Math.min(v, w / 2, h / 2)))
        )
      else P.rect(0, 0, w, h)
      return P
    }

    // ---- text from stored glyph outlines (em units, y up) ----
    drawText(dst, n, L, st) {
      const dtd = n.derivedTextData
      if (!dtd || !dtd.glyphs || !dtd.glyphs.length) {
        st.textWithoutGlyphs++
        return
      }
      const groups = new Map()
      const group = (sid) => {
        let g = groups.get(sid)
        if (!g)
          groups.set(
            sid,
            (g = { path: new this.env.Path2D(), rule: 'nonzero', glyphs: [], rects: [] })
          )
        return g
      }
      for (const g of dtd.glyphs) {
        if (g.commandsBlob == null) {
          if (g.emojiCodePoints && g.emojiCodePoints.length) bump(st.unsupported, '表情字符')
          continue
        }
        const base = this.blobPath(g.commandsBlob)
        if (!base) continue
        const fs = g.fontSize || n.fontSize || 12,
          x = g.position ? g.position.x : 0,
          y = g.position ? g.position.y : 0
        const G = group(g.styleID || 0)
        G.path.addPath(base, new this.env.DOMMatrix([fs, 0, 0, -fs, x, y]))
        G.glyphs.push({ blob: this.doc.blob(g.commandsBlob), m: [fs, 0, 0, -fs, x, y] })
      }
      for (const d of dtd.decorations || [])
        for (const r of d.rects || []) {
          const R = {
              x: r.x,
              y: r.y,
              w: r.w !== undefined ? r.w : r.width,
              h: r.h !== undefined ? r.h : r.height
            },
            G = group(d.styleID || 0)
          G.path.rect(R.x, R.y, R.w, R.h)
          G.rects.push(R)
        }
      const table = n.textData && n.textData.styleOverrideTable
      const size = n.size || { x: 0, y: 0 }
      for (const [sid, shape] of groups) {
        let paints = n.fillPaints
        if (sid && table) {
          const o = table.find((s) => s.styleID === sid)
          if (o && o.fillPaints) paints = o.fillPaints
        }
        if (paints)
          for (const p of paints) this.paint(dst, [shape], p, size, L, st, (n.fontSize || 12) * 0.5)
      }
      if (n.strokePaints && n.strokePaints.length && n.strokeGeometry && n.strokeGeometry.length) {
        const paths = this.geom(n.strokeGeometry)
        if (paths)
          for (const p of n.strokePaints)
            this.paint(dst, paths, p, size, L, st, (n.strokeWeight || 0) + (n.fontSize || 12) * 0.5)
      }
    }

    // ---- paints ----
    paint(dst, paths, p, size, L, st, pad) {
      if (!p || p.visible === false) return
      const op = p.opacity === undefined ? 1 : p.opacity
      if (op <= 0) return
      const w = size.x || 0,
        h = size.y || 0
      dst.box = union(dst.box, boxOf(L, 0, 0, w, h, (pad || 0) * scaleOf(L) + 2))
      if (this.opts.aa === 'figma') {
        this.paintCovered(dst, paths, p, size, L, st, op)
        return
      }
      const c = dst.ctx
      c.save()
      setT(c, L)
      c.globalAlpha = op
      c.globalCompositeOperation = GCO[p.blendMode] || 'source-over'
      if (p.type === 'SOLID') {
        c.fillStyle = css(p.color)
        for (const q of paths) c.fill(q.path, q.rule)
      } else {
        if (paths.length === 1) c.clip(paths[0].path, paths[0].rule)
        else {
          const P = new this.env.Path2D()
          for (const q of paths) P.addPath(q.path)
          c.clip(P, paths[0].rule)
        }
        this.fillPaint(c, p, size, L, st)
      }
      c.restore()
    }

    // Figma's coverage: 4 point samples per pixel (see fig-raster.js), paint evaluated per pixel, then composited.
    paintCovered(dst, paths, p, size, L, st, op) {
      const W = dst.canvas.width,
        H = dst.canvas.height,
        E = new Raster.Edges()
      for (const s of paths) {
        if (s.blob) Raster.addBlob(E, s.blob, L)
        if (s.rect) Raster.addRoundRect(E, s.rect.w, s.rect.h, s.rect.r, L)
        if (s.glyphs) for (const g of s.glyphs) Raster.addBlob(E, g.blob, mul(L, g.m))
        if (s.rects)
          for (const r of s.rects)
            Raster.addRoundRect(E, r.w, r.h, [0, 0, 0, 0], mul(L, [1, 0, 0, 1, r.x, r.y]))
      }
      let cov = Raster.coverage(E, paths[0].rule === 'evenodd', 0, 0, W, H)
      if (dst.clip) cov = Raster.intersect(cov, dst.clip)
      if (!cov) return
      const { x, y, w, h, bits } = cov
      let flat = p.type === 'SOLID' ? css(p.color, op) : null
      if (p.type === 'IMAGE') {
        const key = imageKey(p)
        if (key && !this.images.has(key)) this.need.add(key)
        if (!key || !this.images.get(key)) {
          if (key && this.images.has(key)) st.missingImages++
          flat = MISSING
        } else if (
          this.opts.imageSampling !== 'canvas' &&
          this.paintImageCovered(dst, p, size, L, st, op, cov)
        )
          return
      }
      // Paint the box with Canvas (its colour rounding matches Figma's on interior pixels), then cut it to the samples.
      const tmp = this.env.createCanvas(w, h),
        t = tmp.getContext('2d', RW)
      if (flat) {
        t.fillStyle = flat
        t.fillRect(0, 0, w, h)
      } else {
        t.globalAlpha = op
        t.imageSmoothingEnabled = true
        if ('imageSmoothingQuality' in t)
          t.imageSmoothingQuality = this.opts.imageQuality || 'medium'
        t.setTransform(1, 0, 0, 1, -x, -y)
        t.transform(L[0], L[1], L[2], L[3], L[4], L[5])
        if (!this.fillPaint(t, p, size, L, st)) return
        t.setTransform(1, 0, 0, 1, 0, 0)
      }
      let partial = false
      for (let i = 0; i < bits.length; i++)
        if (bits[i] !== 15) {
          partial = true
          break
        }
      if (partial) {
        const img = this.env.createImageData(w, h),
          d = img.data
        for (let i = 0; i < bits.length; i++) d[i * 4 + 3] = Raster.POP[bits[i]] * 63.75
        const mk = this.env.createCanvas(w, h)
        mk.getContext('2d', RW).putImageData(img, 0, 0)
        t.globalCompositeOperation = 'destination-in'
        t.drawImage(mk, 0, 0)
      }
      const c = dst.ctx
      c.save()
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.globalCompositeOperation = GCO[p.blendMode] || 'source-over'
      c.drawImage(tmp, x, y)
      c.restore()
    }

    // Image paint per pixel, like Figma's image shader: bilinear (clamped) at the pixel centre from the chosen level,
    // transparent where the centre falls outside the image, times the shape's sample coverage. False = not handled.
    paintImageCovered(dst, p, size, L, st, op, cov) {
      const key = imageKey(p),
        img = key ? this.images.get(key) : null
      if (!img || !img.width || !img.height) return false
      if (p.paintFilter || p.filterColorAdjust) bump(st.unsupported, '图片调色')
      const iw = img.width,
        ih = img.height,
        w = size.x || 0,
        h = size.y || 0,
        mode = p.imageScaleMode || 'STRETCH'
      let N // node space → image pixels
      if (mode === 'STRETCH') {
        const T = fromFig(p.transform)
        N = mul(mul([iw, 0, 0, ih, 0, 0], T), [1 / w, 0, 0, 1 / h, 0, 0])
      } else if (mode === 'TILE') {
        const sc = p.scale || 1
        N = [1 / sc, 0, 0, 1 / sc, 0, 0]
      } else {
        const rot = (((p.rotation || 0) % 360) + 360) % 360,
          swap = rot === 90 || rot === 270
        const s =
          mode === 'FIT'
            ? Math.min(w / (swap ? ih : iw), h / (swap ? iw : ih))
            : Math.max(w / (swap ? ih : iw), h / (swap ? iw : ih))
        const a = (-rot * Math.PI) / 180,
          cs = Math.cos(a),
          sn = Math.sin(a)
        N = mul(
          [1 / s, 0, 0, 1 / s, iw / 2, ih / 2],
          mul([cs, sn, -sn, cs, 0, 0], [1, 0, 0, 1, -w / 2, -h / 2])
        )
      }
      const Li = inv(L),
        Ni = inv(N)
      if (!Li || !Ni || !w || !h) return false
      const M = mul(N, Li),
        D = mul(L, Ni) // device → image px, image px → device
      const dw = iw * Math.hypot(D[0], D[1]),
        dh = ih * Math.hypot(D[2], D[3])
      const lvl =
        this.opts.imageSampling === 'bicubic'
          ? this.bicubicCopy(img, key, Math.trunc(dw), Math.trunc(dh))
          : this.pyramidLevel(img, key, dw, dh)
      if (!lvl.px) lvl.px = this.premultiplied(img)
      const { x, y, w: bw, h: bh, bits } = cov,
        lw = lvl.w,
        lh = lvl.h,
        px = lvl.px,
        sx = lw / iw,
        sy = lh / ih,
        tile = mode === 'TILE'
      const out = this.env.createImageData(bw, bh),
        d = out.data
      // A centre exactly on the image's top edge falls outside, one on the bottom edge inside (measured: popup top at
      // y + 0.5 and 9-slice seams match only this way).
      const outside = (u, v) => u < 0 || u > iw || v <= 0 || v > ih
      for (let j = 0; j < bh; j++)
        for (let i = 0; i < bw; i++) {
          const k = Raster.POP[bits[j * bw + i]]
          if (!k) continue
          const X = x + i + 0.5,
            Y = y + j + 0.5
          let u = M[0] * X + M[2] * Y + M[4],
            v = M[1] * X + M[3] * Y + M[5]
          if (tile) {
            u = ((u % iw) + iw) % iw
            v = ((v % ih) + ih) % ih
          } else if (outside(u, v)) continue
          const tx = u * sx - 0.5,
            ty = v * sy - 0.5,
            x0 = Math.floor(tx),
            y0 = Math.floor(ty),
            fx = tx - x0,
            fy = ty - y0
          const xa = tile ? (x0 + lw) % lw : Math.max(0, x0),
            xb = tile ? (x0 + 1) % lw : Math.min(lw - 1, x0 + 1)
          const ya = tile ? (y0 + lh) % lh : Math.max(0, y0),
            yb = tile ? (y0 + 1) % lh : Math.min(lh - 1, y0 + 1)
          const a = (ya * lw + xa) * 4,
            b = (ya * lw + xb) * 4,
            c = (yb * lw + xa) * 4,
            e = (yb * lw + xb) * 4,
            o = (j * bw + i) * 4
          const w00 = (1 - fx) * (1 - fy),
            w10 = fx * (1 - fy),
            w01 = (1 - fx) * fy,
            w11 = fx * fy
          const al = px[a + 3] * w00 + px[b + 3] * w10 + px[c + 3] * w01 + px[e + 3] * w11
          if (al <= 0) continue
          for (let ch = 0; ch < 3; ch++)
            d[o + ch] =
              ((px[a + ch] * w00 + px[b + ch] * w10 + px[c + ch] * w01 + px[e + ch] * w11) / al) *
              255
          d[o + 3] = al * op * k * 63.75
        }
      const tmp = this.env.createCanvas(bw, bh)
      tmp.getContext('2d', RW).putImageData(out, 0, 0)
      const c = dst.ctx
      c.save()
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.globalCompositeOperation = GCO[p.blendMode] || 'source-over'
      c.drawImage(tmp, x, y)
      c.restore()
      return true
    }

    // Gradient or image paint over the node box, in node space (c already carries L). False when nothing was drawn.
    fillPaint(c, p, size, L, st) {
      const w = size.x || 0,
        h = size.y || 0
      switch (p.type) {
        case 'GRADIENT_LINEAR':
        case 'GRADIENT_RADIAL':
        case 'GRADIENT_ANGULAR':
        case 'GRADIENT_DIAMOND': {
          const it = inv(fromFig(p.transform))
          if (!it || !w || !h) return false
          // The paint transform maps the layer's unit box to gradient space; draw in gradient space.
          const G = mul([w, 0, 0, h, 0, 0], it)
          c.transform(G[0], G[1], G[2], G[3], G[4], G[5])
          let grad
          if (p.type === 'GRADIENT_LINEAR') grad = c.createLinearGradient(0, 0.5, 1, 0.5)
          else if (p.type === 'GRADIENT_ANGULAR' && c.createConicGradient)
            grad = c.createConicGradient(0, 0.5, 0.5)
          else grad = c.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5)
          if (p.type === 'GRADIENT_ANGULAR' && !c.createConicGradient)
            bump(st.unsupported, '角度渐变')
          if (p.type === 'GRADIENT_DIAMOND') bump(st.unsupported, '菱形渐变（按径向画）')
          const stops = (p.stops || []).slice().sort((a, b) => a.position - b.position)
          for (const s of stops)
            grad.addColorStop(Math.min(1, Math.max(0, s.position)), css(s.color))
          c.fillStyle = grad
          c.fillRect(-20, -20, 41, 41)
          return true
        }
        case 'IMAGE': {
          const key = imageKey(p),
            img = key ? this.images.get(key) : null
          if (key && !this.images.has(key)) this.need.add(key)
          if (!img) {
            if (key && this.images.has(key)) st.missingImages++
            c.fillStyle = MISSING
            c.fillRect(0, 0, w, h)
            return true
          }
          if (p.paintFilter || p.filterColorAdjust) bump(st.unsupported, '图片调色')
          this.drawImageMode(c, img, p, w, h, L, key)
          return true
        }
        default:
          bump(st.unsupported, '填充 ' + p.type)
          return false
      }
    }

    drawImageMode(c, img, p, w, h, L, key) {
      const iw = img.width,
        ih = img.height
      if (!iw || !ih) return
      const mode = p.imageScaleMode || 'STRETCH'
      if (mode === 'STRETCH') {
        // Crop mode: the transform maps the layer's unit box into the image's unit box.
        const it = inv(fromFig(p.transform))
        if (!it) return
        const D = mul(mul(L, [w, 0, 0, h, 0, 0]), it)
        c.transform(w, 0, 0, h, 0, 0)
        c.transform(it[0], it[1], it[2], it[3], it[4], it[5])
        this.drawSampled(c, img, key, Math.hypot(D[0], D[1]), Math.hypot(D[2], D[3]), 0, 0, 1, 1)
        return
      }
      if (mode === 'TILE') {
        const sc = p.scale || 1,
          pat = c.createPattern(img, 'repeat')
        if (pat && pat.setTransform) pat.setTransform(new this.env.DOMMatrix([sc, 0, 0, sc, 0, 0]))
        c.fillStyle = pat
        c.fillRect(0, 0, w, h)
        return
      }
      const rot = (((p.rotation || 0) % 360) + 360) % 360,
        swap = rot === 90 || rot === 270
      const bw = swap ? ih : iw,
        bh = swap ? iw : ih
      const s = mode === 'FIT' ? Math.min(w / bw, h / bh) : Math.max(w / bw, h / bh)
      c.translate(w / 2, h / 2)
      if (rot) c.rotate((rot * Math.PI) / 180)
      const dx = Math.hypot(L[0], L[1]),
        dy = Math.hypot(L[2], L[3])
      this.drawSampled(
        c,
        img,
        key,
        iw * s * (swap ? dy : dx),
        ih * s * (swap ? dx : dy),
        (-iw * s) / 2,
        (-ih * s) / 2,
        iw * s,
        ih * s
      )
    }

    // Draws img into (x, y, w, h) of the current transform; dw × dh is that rect's size in device pixels.
    // 'pyramid' (measured on native exports): halve with bilinear to ceil(w/2) × ceil(h/2) per level, use the smallest
    // level still at least the drawn size, sample it bilinearly. 'bicubic': useBicubicSampler's cubic shader to the
    // truncated drawn size. 'canvas': the browser's own smoothing.
    drawSampled(c, img, key, dw, dh, x, y, w, h) {
      const mode = this.opts.imageSampling
      if (!key || mode === 'canvas') {
        c.drawImage(img, x, y, w, h)
        return
      }
      const lvl =
        mode === 'bicubic'
          ? this.bicubicCopy(img, key, Math.trunc(dw), Math.trunc(dh))
          : this.pyramidLevel(img, key, dw, dh)
      const q = c.imageSmoothingQuality
      if (q !== undefined) c.imageSmoothingQuality = 'low'
      c.drawImage(lvl.cv, x, y, w, h)
      if (q !== undefined) c.imageSmoothingQuality = q
    }
    premultiplied(img) {
      const iw = img.width,
        ih = img.height,
        sc = this.env.createCanvas(iw, ih),
        sg = sc.getContext('2d', RW)
      sg.drawImage(img, 0, 0)
      const sd = sg.getImageData(0, 0, iw, ih).data,
        src = new Float32Array(iw * ih * 4)
      for (let i = 0; i < sd.length; i += 4) {
        const a = sd[i + 3] / 255
        src[i] = (sd[i] / 255) * a
        src[i + 1] = (sd[i + 1] / 255) * a
        src[i + 2] = (sd[i + 2] / 255) * a
        src[i + 3] = a
      }
      return src
    }
    // Premultiplied 8-bit pixels → { cv, px (premultiplied floats), w, h }.
    level(px8, w, h) {
      const od = this.env.createImageData(w, h),
        o = od.data,
        f = new Float32Array(px8.length)
      for (let i = 0; i < px8.length; i += 4) {
        const a = px8[i + 3],
          k = a ? 255 / a : 0
        o[i] = px8[i] * k
        o[i + 1] = px8[i + 1] * k
        o[i + 2] = px8[i + 2] * k
        o[i + 3] = a
        f[i] = px8[i] / 255
        f[i + 1] = px8[i + 1] / 255
        f[i + 2] = px8[i + 2] / 255
        f[i + 3] = a / 255
      }
      const cv = this.env.createCanvas(w, h)
      cv.getContext('2d', RW).putImageData(od, 0, 0)
      return { cv, px: f, w, h }
    }
    pyramidLevel(img, key, dw, dh) {
      let levels = this.pyramids.get(key)
      if (!levels) this.pyramids.set(key, (levels = [{ cv: img, w: img.width, h: img.height }]))
      for (;;) {
        const top = levels[levels.length - 1],
          nw = Math.ceil(top.w / 2),
          nh = Math.ceil(top.h / 2)
        if (nw < dw || nh < dh || (nw === top.w && nh === top.h)) break
        if (!top.px) top.px = this.premultiplied(img)
        levels.push(this.level(Raster.bilinearResize(top.px, top.w, top.h, nw, nh), nw, nh))
      }
      let pick = levels[0]
      for (const l of levels) if (l.w >= dw && l.h >= dh) pick = l
      return pick
    }
    bicubicCopy(img, key, ow, oh) {
      if (ow < 1 || oh < 1 || ow > 8192 || oh > 8192 || (ow === img.width && oh === img.height))
        return this.pyramidLevel(img, key, img.width, img.height)
      const ck = key + '@' + ow + 'x' + oh
      let res = this.resampled.get(ck)
      if (!res)
        this.resampled.set(
          ck,
          (res = this.level(
            Raster.resample(this.premultiplied(img), img.width, img.height, ow, oh),
            ow,
            oh
          ))
        )
      return res
    }

    // ---- effects on an isolated layer ----
    applyEffects(lay, dst, effects, L, st) {
      if (!lay.box) return
      const W = lay.canvas.width,
        H = lay.canvas.height,
        s = scaleOf(L),
        k = this.opts.blurK
      let margin = 2
      for (const e of effects) {
        const off = e.offset ? Math.hypot(e.offset.x || 0, e.offset.y || 0) : 0
        margin = Math.max(
          margin,
          Math.ceil(((e.radius || 0) * k + off + Math.abs(e.spread || 0)) * s + 3)
        )
      }
      const R = toRect(lay.box, W, H, margin)
      if (!R) return
      const src = lay.ctx.getImageData(R.x, R.y, R.w, R.h).data
      const A = new Float32Array(R.w * R.h)
      for (let i = 0; i < A.length; i++) A[i] = src[i * 4 + 3] / 255
      const lin = (v) => ({
        x: L[0] * (v ? v.x || 0 : 0) + L[2] * (v ? v.y || 0 : 0),
        y: L[1] * (v ? v.x || 0 : 0) + L[3] * (v ? v.y || 0 : 0)
      })
      const put = (plane, color, op) => {
        const img = this.env.createImageData(R.w, R.h),
          d = img.data,
          c = color || { r: 0, g: 0, b: 0, a: 1 }
        const r = c.r * 255,
          g = c.g * 255,
          b = c.b * 255,
          a = (c.a === undefined ? 1 : c.a) * 255
        for (let i = 0; i < plane.length; i++) {
          d[i * 4] = r
          d[i * 4 + 1] = g
          d[i * 4 + 2] = b
          d[i * 4 + 3] = Math.min(255, Math.max(0, a * plane[i]))
        }
        const tmp = this.env.createCanvas(R.w, R.h)
        tmp.getContext('2d', RW).putImageData(img, 0, 0)
        const ctx = lay.ctx
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalCompositeOperation = op
        ctx.drawImage(tmp, R.x, R.y)
        ctx.restore()
      }
      const back = effects.filter((e) => e.type === 'BACKGROUND_BLUR')
      for (const e of back) {
        this.backgroundBlur(dst, R, A, (e.radius || 0) * s * k)
        bump(st.effects, '背景模糊')
      }
      for (const e of effects) {
        if (e.type === 'INNER_SHADOW') {
          const o = lin(e.offset)
          let S = shift(A, R.w, R.h, o.x, o.y, 0)
          for (let i = 0; i < S.length; i++) S[i] = 1 - S[i]
          if ((e.spread || 0) * s >= 0.5) S = morph(S, R.w, R.h, e.spread * s, true)
          S = blurPlane(S, R.w, R.h, (e.radius || 0) * s * k, 1)
          for (let i = 0; i < S.length; i++) S[i] *= A[i]
          put(S, e.color, 'source-atop')
          bump(st.effects, '内阴影')
        }
      }
      for (const e of effects) {
        if (e.type === 'DROP_SHADOW') {
          const o = lin(e.offset)
          let S = shift(A, R.w, R.h, o.x, o.y, 0)
          const sp = (e.spread || 0) * s
          if (sp >= 0.5) S = morph(S, R.w, R.h, sp, true)
          else if (sp <= -0.5) S = morph(S, R.w, R.h, -sp, false)
          S = blurPlane(S, R.w, R.h, (e.radius || 0) * s * k, 0)
          if (e.showShadowBehindNode !== true) for (let i = 0; i < S.length; i++) S[i] *= 1 - A[i]
          put(S, e.color, 'destination-over')
          bump(st.effects, '投影')
        }
      }
      for (const e of effects) {
        if (e.type === 'FOREGROUND_BLUR') {
          this.layerBlur(lay, R, (e.radius || 0) * s * k)
          bump(st.effects, '图层模糊')
        } else if (!['DROP_SHADOW', 'INNER_SHADOW', 'BACKGROUND_BLUR'].includes(e.type))
          bump(st.unsupported, '效果 ' + e.type)
      }
      lay.box = { x0: R.x, y0: R.y, x1: R.x + R.w, y1: R.y + R.h }
    }

    premultBlur(data, w, h, r) {
      const n = w * h,
        ch = [0, 1, 2, 3].map(() => new Float32Array(n))
      for (let i = 0; i < n; i++) {
        const a = data[i * 4 + 3] / 255
        ch[3][i] = a
        ch[0][i] = (data[i * 4] / 255) * a
        ch[1][i] = (data[i * 4 + 1] / 255) * a
        ch[2][i] = (data[i * 4 + 2] / 255) * a
      }
      return ch.map((P) => blurPlane(P, w, h, r, 0))
    }
    layerBlur(lay, R, r) {
      const img = lay.ctx.getImageData(R.x, R.y, R.w, R.h),
        d = img.data
      const ch = this.premultBlur(d, R.w, R.h, r)
      for (let i = 0; i < R.w * R.h; i++) {
        const a = ch[3][i],
          inva = a > 1e-5 ? 1 / a : 0
        d[i * 4] = ch[0][i] * inva * 255
        d[i * 4 + 1] = ch[1][i] * inva * 255
        d[i * 4 + 2] = ch[2][i] * inva * 255
        d[i * 4 + 3] = a * 255
      }
      lay.ctx.putImageData(img, R.x, R.y)
    }
    backgroundBlur(dst, R, A, r) {
      const img = dst.ctx.getImageData(R.x, R.y, R.w, R.h),
        d = img.data
      const ch = this.premultBlur(d, R.w, R.h, r)
      const out = this.env.createImageData(R.w, R.h),
        o = out.data
      for (let i = 0; i < R.w * R.h; i++) {
        const a = ch[3][i],
          inva = a > 1e-5 ? 1 / a : 0
        o[i * 4] = ch[0][i] * inva * 255
        o[i * 4 + 1] = ch[1][i] * inva * 255
        o[i * 4 + 2] = ch[2][i] * inva * 255
        o[i * 4 + 3] = a * A[i] * 255
      }
      const tmp = this.env.createCanvas(R.w, R.h)
      tmp.getContext('2d', RW).putImageData(out, 0, 0)
      const c = dst.ctx
      c.save()
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.drawImage(tmp, R.x, R.y)
      c.restore()
    }
    luminanceToAlpha(lay) {
      const R = toRect(lay.box, lay.canvas.width, lay.canvas.height, 0)
      if (!R) return
      const img = lay.ctx.getImageData(R.x, R.y, R.w, R.h),
        d = img.data
      for (let i = 0; i < d.length; i += 4) {
        const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
        d[i + 3] = d[i + 3] * l
      }
      lay.ctx.putImageData(img, R.x, R.y)
    }

    // Multiplies a finished layer by the parent's clip coverage before it is composited (a quad drawn through a
    // stencil clip, resolved).
    clipLayer(lay, clip) {
      const { x, y, w, h, bits } = clip,
        W = lay.canvas.width,
        H = lay.canvas.height,
        c = lay.ctx
      const img = this.env.createImageData(w, h),
        d = img.data
      for (let i = 0; i < bits.length; i++) d[i * 4 + 3] = Raster.POP[bits[i]] * 63.75
      const mk = this.env.createCanvas(w, h)
      mk.getContext('2d', RW).putImageData(img, 0, 0)
      c.save()
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.globalCompositeOperation = 'destination-in'
      c.drawImage(mk, x, y)
      c.restore()
      c.clearRect(0, 0, W, y)
      c.clearRect(0, y + h, W, H - y - h)
      c.clearRect(0, y, x, h)
      c.clearRect(x + w, y, W - x - w, h)
    }

    composite(dst, lay, opacity, blend, st) {
      if (!lay.box) return
      if (dst.clip) this.clipLayer(lay, dst.clip)
      const c = dst.ctx
      if (blend === 'LINEAR_BURN') {
        this.linearBurn(dst, lay, opacity)
        bump(st.effects, '线性加深（CPU）')
      } else {
        c.save()
        c.setTransform(1, 0, 0, 1, 0, 0)
        c.globalAlpha = opacity
        c.globalCompositeOperation = GCO[blend] || 'source-over'
        c.drawImage(lay.canvas, 0, 0)
        c.restore()
      }
      dst.box = union(dst.box, lay.box)
    }
    // Recovered premultiplied formula: out = S(1-b) + B(1-a) + max(0, S·b + B·a - a·b); alpha = a + b - a·b.
    linearBurn(dst, lay, opacity) {
      const R = toRect(lay.box, lay.canvas.width, lay.canvas.height, 0)
      if (!R) return
      const si = lay.ctx.getImageData(R.x, R.y, R.w, R.h).data,
        bi = dst.ctx.getImageData(R.x, R.y, R.w, R.h),
        bd = bi.data
      for (let i = 0; i < bd.length; i += 4) {
        const a = (si[i + 3] / 255) * opacity,
          b = bd[i + 3] / 255,
          oa = a + b - a * b
        if (oa <= 0) continue
        for (let c = 0; c < 3; c++) {
          const S = (si[i + c] / 255) * a,
            B = (bd[i + c] / 255) * b
          const out = S * (1 - b) + B * (1 - a) + Math.max(0, S * b + B * a - a * b)
          bd[i + c] = Math.min(255, (out / oa) * 255)
        }
        bd[i + 3] = oa * 255
      }
      dst.ctx.putImageData(bi, R.x, R.y)
    }
  }

  function pathMap(list) {
    const m = new Map()
    if (list)
      for (const o of list)
        if (o.guidPath && o.guidPath.guids) m.set(o.guidPath.guids.map(gk).join('/'), o)
    return m
  }
  function propMap(list) {
    const m = new Map()
    if (list) for (const a of list) if (a.defID && a.value) m.set(gk(a.defID), a.value)
    return m
  }

  return { Renderer, hex, blurPlane }
})
