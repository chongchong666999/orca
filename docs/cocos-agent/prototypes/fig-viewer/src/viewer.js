/* oxlint-disable eslint/curly, eslint/no-unused-vars, eslint/prefer-template, unicorn/prefer-number-properties, unicorn/prefer-string-starts-ends-with -- prototype UI keeps browser compatibility code compact */
/* viewer.js — page wiring: open a .fig, browse pages and layers, render a node, compare with a Figma export. */
;(function () {
  'use strict'
  const $ = (s) => document.querySelector(s)
  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
      else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v)
    }
    for (const k of kids)
      if (k !== null && k !== undefined)
        e.append(k.nodeType ? k : document.createTextNode(String(k)))
    return e
  }
  const fmt = (n) => n.toLocaleString('zh-CN')
  const TYPE_TAG = {
    FRAME: '#',
    SECTION: '§',
    INSTANCE: '◇',
    SYMBOL: '❖',
    TEXT: 'T',
    GROUP: '▣',
    VECTOR: '✎',
    BOOLEAN_OPERATION: '∪',
    RECTANGLE: '▭',
    ROUNDED_RECTANGLE: '▭',
    ELLIPSE: '○',
    CANVAS: '▤'
  }

  const state = {
    doc: null,
    renderer: null,
    page: -1,
    selected: -1,
    result: null,
    figmaImage: null,
    view: 'render',
    zoom: 'fit',
    bg: 'checker'
  }

  const codecs = {
    zstd: async (u8) => fzstd.decompress(u8),
    inflateRaw: async (u8) =>
      new Uint8Array(
        await new Response(
          new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
        ).arrayBuffer()
      )
  }

  function setStatus(text, kind) {
    const s = $('#status')
    s.textContent = text
    s.dataset.kind = kind || ''
  }

  async function openFile(file) {
    setStatus('正在读取 ' + file.name + ' …')
    $('#steps').replaceChildren()
    $('#tree').replaceChildren()
    $('#pages').replaceChildren()
    const reader = {
      size: file.size,
      read: async (o, n) => new Uint8Array(await file.slice(o, o + n).arrayBuffer()),
      slice: (o, n) => file.slice(o, o + n)
    }
    const t0 = performance.now()
    try {
      const doc = await FigCore.openFig(reader, codecs, (steps) => showSteps(steps, null))
      const total = Math.round(performance.now() - t0)
      state.doc = doc
      state.renderer = new FigRender.Renderer(doc, {
        Path2D,
        DOMMatrix,
        createCanvas: (w, h) => {
          const c = document.createElement('canvas')
          c.width = w
          c.height = h
          return c
        },
        createImageData: (w, h) => new ImageData(w, h),
        loadImage: async (key) => {
          const src = key.startsWith('blob:') ? doc.blob(+key.slice(5)) : await doc.imageSource(key)
          if (!src) return null
          try {
            return await createImageBitmap(src instanceof Blob ? src : new Blob([src]))
          } catch (e) {
            return null
          }
        }
      })
      showSteps(doc.steps, total)
      const images = doc.entries
        ? [...doc.entries.keys()].filter((k) => k.startsWith('images/') && k.length > 7).length
        : 0
      $('#docinfo').textContent =
        (doc.meta && doc.meta.file_name ? doc.meta.file_name + ' · ' : '') +
        fmt(doc.index.n) +
        ' 个图层 · ' +
        doc.pages().length +
        ' 页 · 文件里有 ' +
        fmt(images) +
        ' 张图片'
      setStatus('已打开：' + file.name + '，用时 ' + (total / 1000).toFixed(2) + ' 秒', 'ok')
      fillPages()
    } catch (e) {
      console.error(e)
      setStatus('打开失败：' + (e && e.message ? e.message : e), 'error')
    }
  }

  function showSteps(steps, total) {
    const box = $('#steps')
    box.replaceChildren(
      ...steps.map((s) => el('span', { class: 'chip' }, s.name + ' ', el('b', {}, s.ms + ' ms')))
    )
    if (total !== null)
      box.append(el('span', { class: 'chip strong' }, '合计 ', el('b', {}, total + ' ms')))
  }

  function fillPages() {
    const { doc } = state,
      sel = $('#pages')
    sel.replaceChildren(
      ...doc.pages().map((i) => el('option', { value: i }, doc.index.names[i] || '（无名页）'))
    )
    const popups = doc.pages().find((i) => /Popups/.test(doc.index.names[i]))
    sel.value = String(popups !== undefined ? popups : doc.pages()[0])
    selectPage(+sel.value)
  }

  function selectPage(i) {
    state.page = i
    state.pageList = null
    $('#search').value = ''
    const tree = $('#tree')
    tree.replaceChildren(...rows(i, 0))
  }

  const RENDERABLE = (doc, i) => {
    const t = doc.index.types[i]
    return t && t !== 'CANVAS' && t !== 'DOCUMENT'
  }

  function rows(parent, depth) {
    const { doc } = state,
      kids = doc.children(parent),
      out = []
    // Same order as Figma Dev Mode's layer list: the file's order, back to front.
    const list = kids
    const LIMIT = 400
    for (const i of list.slice(0, LIMIT)) out.push(row(i, depth))
    if (list.length > LIMIT)
      out.push(
        el(
          'div',
          { class: 'more', style: 'padding-left:' + (16 + depth * 14) + 'px' },
          '还有 ' + (list.length - LIMIT) + ' 项，请用搜索'
        )
      )
    return out
  }

  function row(i, depth) {
    const { doc } = state,
      ix = doc.index,
      has = doc.children(i).length > 0 && ix.types[i] !== 'INSTANCE'
    const wrap = el('div', { class: 'node' })
    const caret = el(
      'button',
      { class: 'caret', 'aria-label': has ? '展开' : '', tabindex: has ? null : '-1' },
      has ? '▸' : ''
    )
    const label = el(
      'button',
      {
        class: 'label' + (ix.hidden[i] ? ' hidden' : ''),
        title: ix.names[i] + '（' + ix.types[i] + '）',
        style: 'padding-left:' + (4 + depth * 14) + 'px'
      },
      el('span', { class: 'tag' }, TYPE_TAG[ix.types[i]] || '·'),
      ix.names[i] || '（无名）'
    )
    let open = false,
      box = null
    caret.addEventListener('click', () => {
      if (!has) return
      open = !open
      caret.textContent = open ? '▾' : '▸'
      if (open) {
        box = el('div', {}, ...rows(i, depth + 1))
        wrap.append(box)
      } else if (box) {
        box.remove()
        box = null
      }
    })
    label.addEventListener('click', () => {
      document.querySelectorAll('.label.sel').forEach((n) => n.classList.remove('sel'))
      label.classList.add('sel')
      select(i)
    })
    wrap.append(el('div', { class: 'line' }, caret, label))
    return wrap
  }

  function search(q) {
    const { doc } = state
    if (!doc) return
    q = q.trim().toLowerCase()
    if (!q) {
      selectPage(state.page)
      return
    }
    if (!state.pageList) {
      const out = [],
        stack = [state.page]
      while (stack.length) {
        const i = stack.pop()
        out.push(i)
        const k = doc.children(i)
        for (let j = k.length - 1; j >= 0; j--) stack.push(k[j])
      }
      state.pageList = out
    }
    const hits = state.pageList
      .filter((i) => (doc.index.names[i] || '').toLowerCase().includes(q))
      .slice(0, 300)
    $('#tree').replaceChildren(
      ...(hits.length
        ? hits.map((i) => row(i, 0))
        : [el('div', { class: 'more' }, '这一页没有匹配的图层')])
    )
  }

  async function select(i) {
    const { doc } = state
    state.selected = i
    const n = doc.node(i)
    const ix = doc.index
    $('#info').replaceChildren(
      kv('名称', ix.names[i] || '（无名）'),
      kv('类型', ix.types[i]),
      kv('图层 ID', ix.keys[i]),
      kv(
        '尺寸',
        n.size ? Math.round(n.size.x * 100) / 100 + ' × ' + Math.round(n.size.y * 100) / 100 : '—'
      ),
      kv('子图层', doc.children(i).length),
      kv(
        '效果',
        (n.effects || [])
          .filter((e) => e.visible !== false)
          .map((e) => e.type + ' r=' + (e.radius || 0))
          .join('、') || '无'
      )
    )
    if (!RENDERABLE(doc, i) || !n.size) {
      setStatus('这一项没有可渲染的尺寸')
      return
    }
    await renderSelected()
  }

  const kv = (k, v) => el('div', { class: 'kv' }, el('span', {}, k), el('span', {}, String(v)))

  async function renderSelected() {
    const { renderer, selected } = state
    if (!renderer || selected < 0) return
    const scale = +$('#scale').value,
      blurK = +$('#blurk').value,
      aa = $('#aa').value,
      imageSampling = $('#imgq').value
    setStatus('渲染中…')
    await new Promise((r) => setTimeout(r, 16))
    try {
      const t0 = performance.now()
      state.result = await renderer.render(selected, scale, { blurK, aa, imageSampling })
      const st = state.result.stats,
        total = Math.round(performance.now() - t0)
      showStats(st, total)
      setStatus(
        '渲染完成：' +
          st.width +
          ' × ' +
          st.height +
          '，' +
          total +
          ' ms' +
          (st.errors.length ? '（有错误，见右侧）' : ''),
        st.errors.length ? 'error' : 'ok'
      )
      state.view = 'render'
      if (state.figmaImage) compare()
      show()
    } catch (e) {
      console.error(e)
      setStatus('渲染失败：' + (e && e.message ? e.message : e), 'error')
    }
  }

  function showStats(st, total) {
    const list = (o) =>
      Object.entries(o)
        .map(([k, v]) => k + ' ' + v)
        .join('、') || '无'
    $('#stats').replaceChildren(
      kv('用时', total + ' ms（绘制 ' + st.ms + ' ms）'),
      kv('画布', st.width + ' × ' + st.height + ' @' + +st.scale.toFixed(3) + 'x'),
      kv('绘制图层', st.nodes),
      kv('展开的组件实例', st.instances),
      kv('离屏图层', st.layers),
      kv('蒙版', st.masks),
      kv('效果', list(st.effects)),
      kv('缺图', st.missingImages ? st.missingImages + ' 处（文件里没存这些图）' : '无'),
      kv('暂不支持', list(st.unsupported)),
      kv('没有字形的文字', st.textWithoutGlyphs || '无'),
      ...(st.errors.length ? [el('pre', { class: 'err' }, st.errors.join('\n\n'))] : [])
    )
  }

  function show() {
    const stage = $('#stage'),
      r = state.result
    if (!r) return
    let c = r.canvas
    if (state.view === 'figma' && state.figmaCanvas) c = state.figmaCanvas
    if (state.view === 'diff' && state.diffCanvas) c = state.diffCanvas
    const area = $('#viewport')
    let z =
      state.zoom === 'fit'
        ? Math.min(1, (area.clientWidth - 40) / c.width, (area.clientHeight - 40) / c.height)
        : +state.zoom
    if (!isFinite(z) || z <= 0) z = 1
    c.style.width = Math.round(c.width * z) + 'px'
    c.style.height = Math.round(c.height * z) + 'px'
    c.style.imageRendering = z >= 2 ? 'pixelated' : 'auto'
    stage.replaceChildren(c)
    stage.dataset.bg = state.bg
    document
      .querySelectorAll('[data-view]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)))
  }

  async function loadFigma(file) {
    try {
      state.figmaImage = await createImageBitmap(file)
      $('#figname').textContent =
        file.name + '（' + state.figmaImage.width + ' × ' + state.figmaImage.height + '）'
      compare()
      state.view = 'diff'
      show()
    } catch (e) {
      setStatus('读不了这张图：' + e.message, 'error')
    }
  }

  // Compares premultiplied values, the same as compositing both images over one backdrop.
  function compare() {
    const r = state.result,
      img = state.figmaImage
    if (!r || !img) return
    const W = r.canvas.width,
      H = r.canvas.height
    const fc = document.createElement('canvas')
    fc.width = W
    fc.height = H
    const fg = fc.getContext('2d')
    fg.drawImage(img, 0, 0, W, H)
    state.figmaCanvas = fc
    const a = r.canvas.getContext('2d').getImageData(0, 0, W, H).data,
      b = fg.getImageData(0, 0, W, H).data
    const dc = document.createElement('canvas')
    dc.width = W
    dc.height = H
    const dg = dc.getContext('2d'),
      di = dg.createImageData(W, H),
      d = di.data
    let le2 = 0,
      le5 = 0,
      sum = 0,
      max = 0,
      sq = 0
    for (let i = 0; i < a.length; i += 4) {
      let m = Math.abs(a[i + 3] - b[i + 3])
      for (let c = 0; c < 3; c++) {
        const v = Math.abs(a[i + c] * a[i + 3] - b[i + c] * b[i + 3]) / 255
        m = Math.max(m, v)
        sum += v
        sq += v * v
      }
      if (m <= 2) le2++
      if (m <= 5) le5++
      if (m > max) max = m
      const lum = (b[i] * 0.3 + b[i + 1] * 0.59 + b[i + 2] * 0.11) * (b[i + 3] / 255) * 0.25
      if (m <= 2) {
        d[i] = lum
        d[i + 1] = lum
        d[i + 2] = lum + 10
      } else {
        d[i] = Math.min(255, 90 + m * 3)
        d[i + 1] = Math.max(40, 190 - m * 2)
        d[i + 2] = 40
      }
      d[i + 3] = 255
    }
    dg.putImageData(di, 0, 0)
    state.diffCanvas = dc
    const n = W * H,
      mse = sq / (n * 3)
    $('#metrics').replaceChildren(
      kv('差值 ≤ 2 的像素', ((100 * le2) / n).toFixed(2) + '%'),
      kv('差值 ≤ 5 的像素', ((100 * le5) / n).toFixed(2) + '%'),
      kv('平均误差', (sum / (n * 3)).toFixed(2) + ' / 255'),
      kv('最大差值', Math.round(max)),
      kv('PSNR', mse ? (10 * Math.log10(65025 / mse)).toFixed(2) + ' dB' : '完全一致'),
      ...(img.width !== W || img.height !== H
        ? [
            el(
              'div',
              { class: 'warn' },
              `尺寸不同：导出图 ${String(img.width)} × ${String(img.height)}，已缩放到渲染尺寸再比，会多出缩放误差。请用相同倍率导出。`
            )
          ]
        : [])
    )
  }

  function download() {
    const r = state.result
    if (!r) return
    r.canvas.toBlob((blob) => {
      const a = el('a', {
        href: URL.createObjectURL(blob),
        download:
          (state.doc.index.names[state.selected] || 'render') + '@' + $('#scale').value + 'x.png'
      })
      document.body.append(a)
      a.click()
      a.remove()
    }, 'image/png')
  }

  // ---- wiring ----
  $('#file').addEventListener('change', (e) => {
    const f = e.target.files[0]
    if (f) openFile(f)
  })
  $('#figma').addEventListener('change', (e) => {
    const f = e.target.files[0]
    if (f) loadFigma(f)
  })
  $('#pages').addEventListener('change', (e) => selectPage(+e.target.value))
  $('#search').addEventListener('input', (e) => {
    clearTimeout(state.searchT)
    state.searchT = setTimeout(() => search(e.target.value), 200)
  })
  for (const id of ['#scale', '#blurk', '#aa', '#imgq'])
    $(id).addEventListener('change', renderSelected)
  $('#zoom').addEventListener('change', (e) => {
    state.zoom = e.target.value
    show()
  })
  $('#bg').addEventListener('change', (e) => {
    state.bg = e.target.value
    show()
  })
  $('#download').addEventListener('click', download)
  document.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => {
      state.view = b.dataset.view
      show()
    })
  )
  window.addEventListener('resize', () => {
    if (state.zoom === 'fit') show()
  })
  const drop = $('#drop')
  ;['dragenter', 'dragover'].forEach((t) =>
    document.addEventListener(t, (e) => {
      e.preventDefault()
      drop.hidden = false
    })
  )
  ;['dragleave', 'drop'].forEach((t) =>
    drop.addEventListener(t, (e) => {
      e.preventDefault()
      drop.hidden = true
    })
  )
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0]
    if (!f) return
    if (/\.fig$/i.test(f.name)) openFile(f)
    else if (/^image\//.test(f.type)) loadFigma(f)
  })
})()
