/* oxlint-disable eslint/curly, unicorn/prefer-number-properties -- browser raster math keeps compact hot loops */
/* fig-raster.js — pixel rules of Figma's renderer that Canvas 2D does not reproduce, measured against Figma's own PNG
 * export (Design Preview - Rankings @1x) and the shaders in compiled.wasm.
 * Paths: stencil-then-cover into a 4x multisampled target. Each edge pixel takes one of five levels decided by four point
 *   samples at the standard positions; vertices snap to 1/256 px; curves are flattened by halving until each piece
 *   deviates at most 1/4 px. coverage() returns per-pixel sample masks so clips intersect sample sets like a stencil.
 * Images: bilinearResize() builds the pyramid (see the renderer); resample() is the useBicubicSampler shader
 *   (compiled.wasm offset 49701955) on the CPU. */
;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.FigRaster = api
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict'

  // Standard 4x sample offsets inside a pixel, sorted by y (y down).
  const SAMPLES = [
    [0.375, 0.125],
    [0.875, 0.375],
    [0.125, 0.625],
    [0.625, 0.875]
  ]
  const SNAP = 256
  const snap = (v) => Math.round(v * SNAP) / SNAP
  const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]

  // Device-space edges, y0 < y1, with the winding direction of the original segment.
  class Edges {
    constructor() {
      this.d = new Float64Array(4096)
      this.n = 0
      this.x0 = Infinity
      this.y0 = Infinity
      this.x1 = -Infinity
      this.y1 = -Infinity
    }
    line(ax, ay, bx, by) {
      if (!isFinite(ax + ay + bx + by)) return
      ax = snap(ax)
      ay = snap(ay)
      bx = snap(bx)
      by = snap(by)
      this.x0 = Math.min(this.x0, ax, bx)
      this.x1 = Math.max(this.x1, ax, bx)
      this.y0 = Math.min(this.y0, ay, by)
      this.y1 = Math.max(this.y1, ay, by)
      if (ay === by) return
      if (this.n * 5 + 5 > this.d.length) {
        const g = new Float64Array(this.d.length * 2)
        g.set(this.d)
        this.d = g
      }
      const o = this.n * 5,
        down = ay < by
      this.d[o] = down ? ax : bx
      this.d[o + 1] = down ? ay : by
      this.d[o + 2] = down ? bx : ax
      this.d[o + 3] = down ? by : ay
      this.d[o + 4] = down ? 1 : -1
      this.n++
    }
  }

  // Segments: the smallest power of two that brings the control polygon's second difference to ≤ 1 px per piece
  // (chord error ≤ ¼ px); the cubic bound adds Wang's ¾ factor.
  const pieces = (need) => {
    let n = 1
    while (n < need && n < 256) n *= 2
    return n
  }
  function quad(E, x0, y0, x1, y1, x2, y2) {
    const n = pieces(Math.sqrt(Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2)))
    let px = x0,
      py = y0
    for (let i = 1; i <= n; i++) {
      const t = i / n,
        u = 1 - t,
        x = u * u * x0 + 2 * u * t * x1 + t * t * x2,
        y = u * u * y0 + 2 * u * t * y1 + t * t * y2
      E.line(px, py, x, y)
      px = x
      py = y
    }
  }
  function cubic(E, x0, y0, x1, y1, x2, y2, x3, y3) {
    const dd = Math.max(
      Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2),
      Math.hypot(x1 - 2 * x2 + x3, y1 - 2 * y2 + y3)
    )
    const n = pieces(Math.sqrt(3 * dd))
    let px = x0,
      py = y0
    for (let i = 1; i <= n; i++) {
      const t = i / n,
        u = 1 - t
      const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3
      const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3
      E.line(px, py, x, y)
      px = x
      py = y
    }
  }
  // Walks Figma's path blob (0 close, 1 move, 2 line, 3 quad, 4 cubic; float32 LE) under matrix m = [a b c d e f].
  function addBlob(E, b, m) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
    const f = (o) => dv.getFloat32(o, true)
    const X = (x, y) => m[0] * x + m[2] * y + m[4],
      Y = (x, y) => m[1] * x + m[3] * y + m[5]
    let sx = 0,
      sy = 0,
      cx = 0,
      cy = 0,
      open = false,
      o = 0
    const close = () => {
      if (open && (cx !== sx || cy !== sy)) E.line(cx, cy, sx, sy)
      open = false
    }
    while (o < b.length) {
      const c = b[o++]
      if (c === 0) {
        close()
        cx = sx
        cy = sy
      } else if (c === 1) {
        close()
        const x = f(o),
          y = f(o + 4)
        o += 8
        sx = cx = X(x, y)
        sy = cy = Y(x, y)
        open = true
      } else if (c === 2) {
        const x = f(o),
          y = f(o + 4)
        o += 8
        const nx = X(x, y),
          ny = Y(x, y)
        E.line(cx, cy, nx, ny)
        cx = nx
        cy = ny
        open = true
      } else if (c === 3) {
        const x1 = X(f(o), f(o + 4)),
          y1 = Y(f(o), f(o + 4)),
          x2 = X(f(o + 8), f(o + 12)),
          y2 = Y(f(o + 8), f(o + 12))
        o += 16
        quad(E, cx, cy, x1, y1, x2, y2)
        cx = x2
        cy = y2
        open = true
      } else if (c === 4) {
        const x1 = X(f(o), f(o + 4)),
          y1 = Y(f(o), f(o + 4)),
          x2 = X(f(o + 8), f(o + 12)),
          y2 = Y(f(o + 8), f(o + 12)),
          x3 = X(f(o + 16), f(o + 20)),
          y3 = Y(f(o + 16), f(o + 20))
        o += 24
        cubic(E, cx, cy, x1, y1, x2, y2, x3, y3)
        cx = x3
        cy = y3
        open = true
      } else break
    }
    close()
  }
  // Rounded rectangle in node space (radii tl, tr, br, bl), arcs as the usual 0.5523 cubic approximation.
  function addRoundRect(E, w, h, r, m) {
    const X = (x, y) => m[0] * x + m[2] * y + m[4],
      Y = (x, y) => m[1] * x + m[3] * y + m[5]
    const k = 0.5522847498
    const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(v || 0, w / 2, h / 2)))
    const pts = []
    const L = (x, y) => pts.push(['L', x, y])
    const C = (x1, y1, x2, y2, x, y) => pts.push(['C', x1, y1, x2, y2, x, y])
    L(tl, 0)
    L(w - tr, 0)
    if (tr) C(w - tr + tr * k, 0, w, tr - tr * k, w, tr)
    L(w, h - br)
    if (br) C(w, h - br + br * k, w - br + br * k, h, w - br, h)
    L(bl, h)
    if (bl) C(bl - bl * k, h, 0, h - bl + bl * k, 0, h - bl)
    L(0, tl)
    if (tl) C(0, tl - tl * k, tl - tl * k, 0, tl, 0)
    let cx = X(tl, 0),
      cy = Y(tl, 0)
    for (const p of pts) {
      if (p[0] === 'L') {
        const nx = X(p[1], p[2]),
          ny = Y(p[1], p[2])
        E.line(cx, cy, nx, ny)
        cx = nx
        cy = ny
      } else {
        const x3 = X(p[5], p[6]),
          y3 = Y(p[5], p[6])
        cubic(E, cx, cy, X(p[1], p[2]), Y(p[1], p[2]), X(p[3], p[4]), Y(p[3], p[4]), x3, y3)
        cx = x3
        cy = y3
      }
    }
  }

  // Per pixel, a 4-bit mask of the samples inside the path, within the integer box [bx0, bx1) × [by0, by1).
  // Samples on an edge follow the top-left rule (spans are [left, right), edges are [top, bottom)).
  function coverage(E, evenOdd, bx0, by0, bx1, by1) {
    const x0 = Math.max(bx0, Math.floor(E.x0)),
      y0 = Math.max(by0, Math.floor(E.y0))
    const x1 = Math.min(bx1, Math.ceil(E.x1) + 1),
      y1 = Math.min(by1, Math.ceil(E.y1) + 1)
    if (x1 <= x0 || y1 <= y0 || !E.n) return null
    const w = x1 - x0,
      h = y1 - y0,
      bits = new Uint8Array(w * h),
      d = E.d
    const order = new Uint32Array(E.n)
    for (let i = 0; i < E.n; i++) order[i] = i
    order.sort((a, b) => d[a * 5 + 1] - d[b * 5 + 1])
    let next = 0,
      act = []
    const xs = new Float64Array(E.n),
      ws = new Int8Array(E.n)
    for (let py = y0; py < y1; py++) {
      for (let s = 0; s < 4; s++) {
        const sy = py + SAMPLES[s][1],
          sxo = SAMPLES[s][0],
          bit = 1 << s
        while (next < E.n && d[order[next] * 5 + 1] <= sy) act.push(order[next++])
        let m = 0,
          keep = 0
        for (let i = 0; i < act.length; i++) {
          const e = act[i] * 5
          if (d[e + 3] <= sy) continue
          act[keep++] = act[i]
          const x = d[e] + ((sy - d[e + 1]) * (d[e + 2] - d[e])) / (d[e + 3] - d[e + 1])
          let j = m++
          while (j > 0 && xs[j - 1] > x) {
            xs[j] = xs[j - 1]
            ws[j] = ws[j - 1]
            j--
          }
          xs[j] = x
          ws[j] = d[e + 4]
        }
        act.length = keep
        if (!m) continue
        const row = (py - y0) * w
        let wind = 0
        for (let i = 0; i < m - 1; i++) {
          wind += ws[i]
          if (evenOdd ? (wind & 1) === 0 : wind === 0) continue
          let a = Math.ceil(xs[i] - sxo),
            z = Math.ceil(xs[i + 1] - sxo)
          if (a < x0) a = x0
          if (z > x1) z = x1
          for (let px = a; px < z; px++) bits[row + px - x0] |= bit
        }
      }
    }
    return { x: x0, y: y0, w, h, bits }
  }
  // Keeps only the samples also inside clip (same pixel grid); null when nothing is left.
  function intersect(cov, clip) {
    if (!cov || !clip) return clip ? null : cov
    const x0 = Math.max(cov.x, clip.x),
      y0 = Math.max(cov.y, clip.y),
      x1 = Math.min(cov.x + cov.w, clip.x + clip.w),
      y1 = Math.min(cov.y + cov.h, clip.y + clip.h)
    if (x1 <= x0 || y1 <= y0) return null
    const w = x1 - x0,
      h = y1 - y0,
      bits = new Uint8Array(w * h)
    let any = 0
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        any |= bits[y * w + x] =
          cov.bits[(y + y0 - cov.y) * cov.w + x + x0 - cov.x] &
          clip.bits[(y + y0 - clip.y) * clip.w + x + x0 - clip.x]
    return any ? { x: x0, y: y0, w, h, bits } : null
  }

  // ---- bicubic resample (shader @49701955) ----
  // Keys cubic with a = c; c = -clamp(inH / outH, 1, 2.5). Downscaling widens the support to k + 2 texels per side,
  // k = min(10, ceil(ratio - 1)), and both axes use the height ratio. Taps outside the image are dropped from the sum.
  const keys = (x, c) => {
    x = Math.abs(x)
    if (x <= 1) return (c + 2) * x * x * x - (c + 3) * x * x + 1
    if (x < 2) return c * x * x * x - 5 * c * x * x + 8 * c * x - 4 * c
    return 0
  }
  // src: premultiplied RGBA floats 0..1 (iw × ih). Returns premultiplied 8-bit RGBA (ow × oh).
  function resample(src, iw, ih, ow, oh) {
    const j = ih / oh,
      c = -Math.min(Math.max(j, 1), 2.5),
      k = j > 1 ? Math.min(10, Math.ceil(j - 1)) : 0
    const lo = -1 - k,
      hi = k + 2,
      span = k + 2,
      taps = hi - lo + 1
    const out = new Uint8ClampedArray(ow * oh * 4)
    const wx = new Float64Array(taps * ow),
      ix = new Int32Array(ow),
      wy = new Float64Array(taps),
      acc = new Float64Array(4)
    for (let x = 0; x < ow; x++) {
      const e = ((x + 0.5) / ow) * iw - 0.5,
        f = Math.floor(e)
      ix[x] = f
      for (let p = lo; p <= hi; p++) wx[x * taps + p - lo] = keys((2 * (p - (e - f))) / span, c)
    }
    for (let y = 0; y < oh; y++) {
      const e = ((y + 0.5) / oh) * ih - 0.5,
        fy = Math.floor(e)
      for (let q = lo; q <= hi; q++) wy[q - lo] = keys((2 * (q - (e - fy))) / span, c)
      for (let x = 0; x < ow; x++) {
        acc.fill(0)
        let m = 0
        for (let q = lo; q <= hi; q++) {
          const sy = fy + q
          if (sy < 0 || sy >= ih) continue
          for (let p = lo; p <= hi; p++) {
            const sx = ix[x] + p
            if (sx < 0 || sx >= iw) continue
            const wgt = wx[x * taps + p - lo] * wy[q - lo],
              o = (sy * iw + sx) * 4
            acc[0] += src[o] * wgt
            acc[1] += src[o + 1] * wgt
            acc[2] += src[o + 2] * wgt
            acc[3] += src[o + 3] * wgt
            m += wgt
          }
        }
        const o = (y * ow + x) * 4,
          inv = m ? 255 / m : 0
        out[o] = acc[0] * inv
        out[o + 1] = acc[1] * inv
        out[o + 2] = acc[2] * inv
        out[o + 3] = acc[3] * inv
      }
    }
    return out
  }

  // Plain bilinear resize (texel centres, clamp to edge): one pyramid level. src premultiplied floats → 8-bit.
  function bilinearResize(src, iw, ih, ow, oh) {
    const out = new Uint8ClampedArray(ow * oh * 4)
    for (let y = 0; y < oh; y++) {
      const sy = ((y + 0.5) / oh) * ih - 0.5,
        y0 = Math.floor(sy),
        fy = sy - y0
      const ya = Math.min(ih - 1, Math.max(0, y0)),
        yb = Math.min(ih - 1, Math.max(0, y0 + 1))
      for (let x = 0; x < ow; x++) {
        const sx = ((x + 0.5) / ow) * iw - 0.5,
          x0 = Math.floor(sx),
          fx = sx - x0
        const xa = Math.min(iw - 1, Math.max(0, x0)),
          xb = Math.min(iw - 1, Math.max(0, x0 + 1))
        const a = (ya * iw + xa) * 4,
          b = (ya * iw + xb) * 4,
          c = (yb * iw + xa) * 4,
          d = (yb * iw + xb) * 4,
          o = (y * ow + x) * 4
        for (let k = 0; k < 4; k++)
          out[o + k] =
            255 *
            ((src[a + k] * (1 - fx) + src[b + k] * fx) * (1 - fy) +
              (src[c + k] * (1 - fx) + src[d + k] * fx) * fy)
      }
    }
    return out
  }

  return { POP, Edges, addBlob, addRoundRect, coverage, intersect, resample, bilinearResize }
})
