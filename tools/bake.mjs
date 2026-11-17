/*
 * Bakes the pond into hooks/scenes.ts: one SVG document per water.
 *
 *   node tools/bake.mjs
 *
 * The koi are drawn by ASCII Koi's own engine (tools/pond.js, MIT, by
 * pursurer, unchanged on disk). This script poses each koi, lets pond.js
 * rasterise it into its character cells, and reads the cells back: the
 * tiles, the glyph pressed into each, their colours and the shadow. It does
 * that for each frame of the body wave, so the swim is pond.js's own.
 *
 * Why it stays smooth on a slow GPU: every animation in the document is
 * stepped. A koi moves one whole cell at a time (pond.js's grid) and its
 * frames switch in steps, so the app only repaints a small patch when a cell
 * really changes, a few times a second, instead of the whole scene sixty
 * times a second. Nothing blinks: a frame swap changes only part of one koi.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'

const HERE = new URL('.', import.meta.url)
const OUT = new URL('../hooks/scenes.ts', HERE)

/* ── run pond.js, with one read-only accessor added in memory for its cell buffers ── */
const ANCHOR = 'light: (x, y) => caus(x, y)'
const source = readFileSync(new URL('pond.js', HERE), 'utf8')
if (!source.includes(ANCHOR)) throw new Error('pond.js changed: the accessor anchor is gone')
const patched = source.replace(ANCHOR, `${ANCHOR},
      cells: () => ({ cols, rows, cw, ch, tileRGB, tileA, glyphRGB, glyphA, glyphCode, shade, touched: touched.slice() }),
      fx: () => ({ t, paws, rings, drops, drawPaw })`)
const box = {}
vm.createContext(box)
vm.runInContext(patched, box)
const { createPond } = box.AsciiKoi

/*
 * A canvas that draws nothing: pond.js only needs somewhere to send its calls.
 * While `rec` is an array, the calls the paw needs are kept in it, with the
 * paint state they were made in.
 */
let rec = null
const state = { fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, lineWidth: 1, font: '' }
let pathRects = [], pathArcs = []
const methods = {
  beginPath() { pathRects = []; pathArcs = [] },
  rect(x, y, w, h) { pathRects.push([x, y, w, h]) },
  arc(x, y, r, a0, a1) { pathArcs.push([x, y, r, a0, a1]) },
  fill(path) { if (rec) rec.push({ op: 'rects', rects: path ? path.rects.slice() : pathRects.slice(), fill: state.fillStyle, a: state.globalAlpha }) },
  fillRect(x, y, w, h) { if (rec) rec.push({ op: 'rects', rects: [[x, y, w, h]], fill: state.fillStyle, a: state.globalAlpha }) },
  fillText(g, x, y) { if (rec) rec.push({ op: 'text', g, x, y, fill: state.fillStyle, a: state.globalAlpha, font: state.font }) },
  stroke() { if (rec) rec.push({ op: 'arcs', arcs: pathArcs.slice(), stroke: state.strokeStyle, a: state.globalAlpha, w: state.lineWidth }) },
}
const ctx = new Proxy(state, { get: (o, k) => (k in methods ? methods[k] : k in o ? o[k] : () => {}), set: (o, k, v) => ((o[k] = v), true) })
const canvas = { width: 0, height: 0, getContext: () => ctx }
box.Path2D = class { constructor() { this.rects = [] } rect(x, y, w, h) { this.rects.push([x, y, w, h]) } }

/* ASCII Koi's three waters, from its pond.css */
const WATERS = {
  blue: { water: '#0e2a32', ink: '#ebe6dc', accent: '#e8784f', koiLight: '#ece6da', koiDark: '#3a3632', dark: true },
  black: { water: '#0d1315', ink: '#ebe6dc', accent: '#e8784f', koiLight: '#ece6da', koiDark: '#3a3632', dark: true },
  white: { water: '#e9e4da', ink: '#1c1a17', accent: '#9e3214', koiLight: '#f7f2e8', koiDark: '#2b2723', dark: false },
}

/* ── the scene's plan ── */
const W = 1100, H = 688 // the pond's view, cropped to the window: koi about 1.5 times ASCII Koi's on-screen size
const PW = 1760, PH = 1100 // the pond pond.js lays out: cells of 10 by 13, koi at full size
const F = 5 // frames of the body wave
const BEAT = 1 // seconds a wave takes: five frames, one per tick of the scene (0.2 s)
/* which of pond.js's fourteen koi to draw (its variety and colours come with it), which way it faces, how deep */
const DESIGNS = [
  { fish: 0, angle: 22, depth: 0.95 }, // kohaku, down and to the right
  { fish: 1, angle: 200, depth: 0.85 }, // sanke, vermilion, up and to the left
  { fish: 2, angle: -18, depth: 0.8 }, // kohaku, gold, up and to the right
]
/* ── small helpers ── */
const hex = n => '#' + n.toString(16).padStart(6, '0')
const q = (v, step) => Math.round(v / step) * step
const num = v => String(Math.round(v * 100) / 100)
function rand(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* pond.js's caustic net and sparks, the same formulas, for the water under the koi */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k) }
const lerp = (a, b, e) => a + (b - a) * e
const h2 = (a, b) => { let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1); x = Math.imul(x ^ (x >>> 15), 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296 }
const noise = (x, y, seed) => {
  const xi = Math.floor(x), yi = Math.floor(y), u = sstep(0, 1, x - xi), v = sstep(0, 1, y - yi)
  const a = h2(xi + seed * 131, yi), b = h2(xi + 1 + seed * 131, yi), c = h2(xi + seed * 131, yi + 1), d = h2(xi + 1 + seed * 131, yi + 1)
  return lerp(lerp(a, b, u), lerp(c, d, u), v)
}
const caus = (x, y, t) => 1 - Math.min(1, Math.abs(noise(x / 46 + t * 0.21, y / 46 - t * 0.13, 7) - noise(x / 39 - t * 0.17, y / 52 + t * 0.19, 11)) * 5.5)

/*
 * Glyphs as <text>: x (and y) per glyph. A "/" followed by "*" in one run reads
 * as a CSS comment to the app's check, so such a pair starts a new <text>.
 */
function textEls(cls, items, x, y, g) {
  let out = '', s = 0
  for (let i = 1; i <= items.length; i++) {
    if (i < items.length && !(g(items[i - 1]) === '/' && g(items[i]) === '*')) continue
    const part = items.slice(s, i), ys = part.map(y)
    s = i
    out += `<text class="${cls}" x="${part.map(x).join(' ')}" y="${ys.every(v => v === ys[0]) ? ys[0] : ys.join(' ')}">${part.map(g).join('')}</text>`
  }
  return out
}

function bake(waterName) {
  const pal = WATERS[waterName]
  const pond = createPond({ canvas, palette: () => pal, reduce: false })
  pond.size(PW, PH)
  pond.reset()
  const fish = pond.fish

  /*
   * The paints: one class per colour and opacity, shared by the whole document.
   * Tiles and shadows are short thick strokes (one move and an h per cell); glyphs are filled text.
   */
  const paints = new Map()
  const paint = (kind, rgb, a) => {
    const ch8 = v => Math.min(255, q(v, 16))
    const key = `${kind}${hex((ch8(rgb >> 16) << 16) | (ch8((rgb >> 8) & 255) << 8) | ch8(rgb & 255))}/${num(clamp(q(a, 0.1), 0.05, 1))}`
    if (!paints.has(key)) paints.set(key, kind + paints.size.toString(36))
    return paints.get(key)
  }

  /* one layer of cells as markup: a Map of "col,row" to [paint, glyph?] */
  const strokes = (cells, cw, ch, run) => {
    const byPaint = new Map()
    for (const [at, [p]] of cells) {
      const [c, r] = at.split(',').map(Number)
      if (!byPaint.has(p)) byPaint.set(p, [])
      byPaint.get(p).push([c, r])
    }
    let out = ''
    for (const [p, list] of byPaint) {
      list.sort((a, b) => a[1] - b[1] || a[0] - b[0])
      let d = '', cx = 0, cy = 0
      for (let s = 0; s < list.length; ) {
        let e = s
        /* shadows merge into runs along a row; tiles keep pond.js's hairline gap, one per cell */
        /* a row of neighbours in one paint is one stroke: whole for shadows, dashed 9 on 1 off for tiles, which draws pond.js's hairline gaps */
        while (e + 1 < list.length && list[e + 1][1] === list[s][1] && list[e + 1][0] === list[e][0] + 1) e++
        const [c, r] = list[s]
        const x = c * cw + (run ? 0 : 0.5), y = r * ch + ch / 2, len = (e - s + 1) * cw - (run ? 0 : 1)
        d += d === '' ? `M${x} ${y}` : `m${num(x - cx)} ${num(y - cy)}`
        d += `h${len}`
        cx = x + len; cy = y
        s = e + 1
      }
      out += `<path class="${p}" d="${d}"/>`
    }
    return out
  }
  const texts = (cells, cw, ch) => {
    const rows = new Map()
    for (const [at, [p, g]] of cells) {
      const [c, r] = at.split(',').map(Number)
      const key = `${p}|${r}`
      if (!rows.has(key)) rows.set(key, [])
      rows.get(key).push([c, g])
    }
    let out = ''
    for (const [key, list] of rows) {
      const [p, r] = key.split('|')
      list.sort((a, b) => a[0] - b[0])
      out += textEls(p, list, l => l[0] * cw + cw / 2, () => Number(r) * ch + ch / 2, l => l[1])
    }
    return out
  }

  /* what every frame shares, then each frame of every design: a paw's scene keeps only the first */
  const defs = { base: '', frames: Array.from({ length: F }, () => '') }
  for (const [di, des] of DESIGNS.entries()) {
    const f = fish[des.fish]
    for (const o of fish) o.seen = 0
    const { cw, ch } = pond.cells()
    const hc = 88, hr = 42 // the head's cell, in the middle of the pond
    /* each frame's three layers, as pond.js draws them: shadows, then tiles, then glyphs */
    const frames = []
    for (let k = 0; k < F; k++) {
      f.seen = 1; f.a = (des.angle * Math.PI) / 180; f.turn = 0; f.flee = 0; f.kick = 0; f.rise = 0; f.beat = 0.5; f.depth = des.depth
      /* a third of a pixel off the cell centre: exactly on it, the snout tip divides 0 by 0 in pond.js */
      f.nx = ((hc + 0.5) * cw + 0.31) / PW; f.ny = ((hr + 0.5) * ch + 0.29) / PH
      for (let j = 0; j < 10; j++) { f.nodes[j * 2] = -Math.cos(f.a) * f.seg * j; f.nodes[j * 2 + 1] = -Math.sin(f.a) * f.seg * j }
      f.phase = (k / F) * Math.PI * 2
      pond.render()
      const c = pond.cells()
      const layers = [new Map(), new Map(), new Map()]
      for (let i = 0; i < c.shade.length; i++) {
        if (!(c.shade[i] > 0.02)) continue
        layers[0].set(`${(i % c.cols) - hc},${((i / c.cols) | 0) - hr}`, [paint('s', pal.dark ? 0 : packed(pal.water, 0.55), c.shade[i])])
      }
      for (const i of c.touched) {
        const at = `${(i % c.cols) - hc},${((i / c.cols) | 0) - hr}`
        if (c.tileA[i] > 0.02) layers[1].set(at, [paint('t', c.tileRGB[i], c.tileA[i])])
        if (c.glyphA[i] > 0.02 && c.glyphCode[i] !== 32) layers[2].set(at, [paint('g', c.glyphRGB[i], c.glyphA[i]), String.fromCharCode(c.glyphCode[i])])
      }
      frames.push(layers)
    }
    /* what every frame shares goes in one base per layer; each frame keeps only its own cells */
    const same = (a, b) => a !== undefined && b !== undefined && a[0] === b[0] && a[1] === b[1]
    const base = [0, 1, 2].map(L => new Map([...frames[0][L]].filter(([at, v]) => frames.every(fr => same(fr[L].get(at), v)))))
    for (const fr of frames) for (const L of [0, 1, 2]) for (const at of base[L].keys()) fr[L].delete(at)
    const draw = (layers, id) => [
      strokes(layers[0], cw, ch, true),
      strokes(layers[1], cw, ch, false),
      texts(layers[2], cw, ch),
    ]
    const [bs, bt, bg] = draw(base)
    defs.base += `<g id="d${di}s" stroke-width="${ch}">${bs}</g><g id="d${di}t" stroke-width="${ch - 1}" stroke-dasharray="9 1">${bt}</g><g id="d${di}g">${bg}</g>`
    frames.forEach((fr, k) => {
      const [s, t, g] = draw(fr)
      defs.frames[k] += `<g id="d${di}f${k}"><use href="#d${di}s"/><g stroke-width="${ch}">${s}</g><use href="#d${di}t"/><g stroke-width="${ch - 1}" stroke-dasharray="9 1">${t}</g><use href="#d${di}g"/>${g}</g>`
    })
  }

  /* ── the water: pond.js's net and sparks at one moment, drifting a cell at a time ── */
  const cw = 10, ch = 13, T = 37
  const netRows = new Map()
  /* the layer starts 8 cells left and 4 rows up and drifts back to the origin, so it covers just the view on its way */
  for (let row = 0; row < (H + 52) / ch; row++) {
    for (let col = 0; col < (W + 80) / cw; col++) {
      const x = col * cw + cw / 2, y = row * ch + ch / 2
      const cl = caus(x, y, T)
      let gch = '', a = 0
      if (cl > 0.8) { a = (cl - 0.8) * 1.3; gch = cl > 0.94 ? '~' : cl > 0.87 ? '-' : '·' }
      else if (h2(col, row) < 0.022) { a = 0.16; gch = '·' }
      if (!gch || a < 0.13) continue
      const p = paint('g', packed(pal.dark ? pal.koiLight : pal.ink), a > 0.17 ? 0.24 : a > 0.11 ? 0.16 : 0.08)
      const key = `${p}|${y}`
      if (!netRows.has(key)) netRows.set(key, [])
      netRows.get(key).push([x, gch])
    }
  }
  let net = ''
  for (const [key, list] of netRows) {
    const [p, y] = key.split('|')
    net += textEls(p, list, l => l[0], () => y, l => l[1])
  }

  /* the paints this water's koi and net use, as classes */
  let css = ''
  for (const [key, name] of paints) {
    const [color, a] = key.slice(1).split('/')
    css += key[0] === 'g' ? `.${name}{fill:${color}${a === '1' ? '' : `;fill-opacity:${a}`}}` : `.${name}{stroke:${color}${a === '1' ? '' : `;stroke-opacity:${a}`}}`
  }
  return { css, defs, net }
}

/*
 * The clock's characters and the day's word, in ASCII Koi's AsciiMark cells
 * (tools/marks.json, from tools/bake-marks.cjs). Colourless: each draws in
 * currentColor, so the scene colours them by position as AsciiMark's
 * left-to-right gradient does; the glyph pressed into each tile is in the
 * water's colour (class mw).
 */
const MARKS = JSON.parse(readFileSync(new URL('marks.json', HERE), 'utf8'))
const NOISE_EDGE = ' |/-\\'
function markDef(id, mark, cw, ch, tone, bands) {
  const gap = cw * 0.06
  const groups = new Map() // band -> { tiles: Map(alpha -> [x,y]), glyphs: Map(cls -> [x,y,g]) }
  const band = c => (bands ? Math.min(bands - 1, Math.floor((c / mark.cols) * bands)) : 0)
  const get = b => { if (!groups.has(b)) groups.set(b, { tiles: new Map(), glyphs: new Map() }); return groups.get(b) }
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v) }
  for (const [c, r, v, e, ex, ey] of mark.cells) {
    const g = get(band(c)), cx = mark.ox + c * cw + cw / 2, cy = mark.oy + r * ch + ch / 2
    if (e) push(g.glyphs, `ma${Math.round(clamp(tone * Math.min(1, 0.5 + v), 0, 1) * 10)}`, [cx + ex, cy + ey, NOISE_EDGE[e]])
    else if (v >= 0.62) {
      push(g.tiles, Math.round(clamp(tone * (0.68 + 0.27 * Math.min(1, (v - 0.62) / 0.3)), 0, 1) * 20), [mark.ox + c * cw + gap, cy])
      const h = h2(c + 7, r + 3)
      push(g.glyphs, 'mw', [cx, cy, v > 0.9 ? (h < 0.5 ? '#' : '@') : '%'])
    } else push(g.glyphs, `ma${Math.round(tone * 0.85 * 10)}`, [cx, cy, v > 0.32 ? '+' : ':'])
  }
  let out = ''
  for (const [b, g] of [...groups].sort((x, y) => x[0] - y[0])) {
    let inner = ''
    for (const [a, list] of g.tiles) {
      let d = '', px = 0, py = 0
      list.sort((p, q2) => p[1] - q2[1] || p[0] - q2[0])
      for (let s = 0; s < list.length; ) {
        let e = s
        while (e + 1 < list.length && list[e + 1][1] === list[s][1] && Math.abs(list[e + 1][0] - list[e][0] - cw) < 0.01) e++
        const [x, y] = list[s], len = (e - s + 1) * cw - 2 * gap
        d += d === '' ? `M${num(x)} ${num(y)}` : `m${num(x - px)} ${num(y - py)}`
        d += `h${num(len)}`
        px = x + len; py = y
        s = e + 1
      }
      inner += `<path class="mt${a}" d="${d}"/>`
    }
    for (const [cls, list] of g.glyphs) {
      inner += textEls(cls, list, l => Math.round(l[0]), l => Math.round(l[1]), l => l[2])
    }
    out += bands ? `<g class="b${b}">${inner}</g>` : inner
  }
  return `<g id="${id}" stroke-width="${num(ch - 2 * gap)}" stroke-dasharray="${num(cw - 2 * gap)} ${num(2 * gap)}" font-size="${num(ch * 0.95)}" font-weight="700">${out}</g>`
}
const markClasses = () => {
  let css = ''
  for (let a = 1; a <= 20; a++) css += `.mt${a}{stroke:currentColor;stroke-opacity:${a / 20}}`
  for (let a = 1; a <= 10; a++) css += `.ma${a}{fill:currentColor;fill-opacity:${a / 10}}`
  return css
}

function packed(h, k = 1) {
  const n = parseInt(h.slice(1), 16)
  return ((((n >> 16) * k) | 0) << 16) | ((((n >> 8) & 255) * k) | 0) << 8 | (((n & 255) * k) | 0)
}

/*
 * The cat's paw, as pond.js draws it: its catch at 7 frames a second, from
 * the top edge and from the bottom, each relative to the point clicked. The
 * rings and drops it throws are kept as when and where, for the scene to
 * draw with CSS.
 */
const PAW_FPS = 7
function bakePaw(waterName, fromTop) {
  const pal = WATERS[waterName]
  const pond = createPond({ canvas, palette: () => pal, reduce: false })
  pond.size(PW, PH)
  pond.reset()
  const X = 880, Y = fromTop ? 400 : 700
  pond.paw(X, Y)
  const born = pond.fx().t
  const classes = new Map()
  const cls = (kind, color, a) => {
    const key = `${kind}${color}/${num(clamp(q(a, 0.1), 0.1, 1))}`
    if (!classes.has(key)) classes.set(key, 'x' + classes.size.toString(36))
    return classes.get(key)
  }
  const frames = []
  const seen = new Map()
  for (let i = 0; ; i++) {
    pond.seek(i / PAW_FPS, false)
    const { paws } = pond.fx()
    for (const d of pond.fx().drops) seen.set(d.born + ',' + d.x1, d)
    if (!paws.length) break
    rec = []
    pond.fx().drawPaw(paws[0])
    const ops = rec
    rec = null
    const fills = new Map(), texts = new Map()
    let arcs = ''
    for (const o of ops) {
      if (o.op === 'rects') {
        const c = cls('r', o.fill, o.a)
        if (!fills.has(c)) fills.set(c, [])
        for (const r of o.rects) fills.get(c).push(r)
      } else if (o.op === 'text') {
        const c = cls('f', o.fill, o.a)
        if (!texts.has(c)) texts.set(c, [])
        texts.get(c).push([o.x - X, o.y - Y, o.g])
      } else if (o.op === 'arcs') {
        const c = cls('s', o.stroke, o.a)
        for (const [x, y, r, a0, a1] of o.arcs) {
          const sx = x + r * Math.cos(a0) - X, sy = y + r * Math.sin(a0) - Y, ex = x + r * Math.cos(a1) - X, ey = y + r * Math.sin(a1) - Y
          arcs += `<path class="${c}" stroke-width="${num(o.w)}" d="M${num(sx)} ${num(sy)}A${num(r)} ${num(r)} 0 0 1 ${num(ex)} ${num(ey)}"/>`
        }
      }
    }
    let g = ''
    for (const [c, rects] of fills) {
      /* cells on one row that touch merge into one rectangle */
      rects.sort((a, b) => a[1] - b[1] || a[0] - b[0])
      const byH = new Map()
      for (let s = 0; s < rects.length; ) {
        let e = s
        while (e + 1 < rects.length && rects[e + 1][1] === rects[s][1] && rects[e + 1][3] === rects[s][3] && Math.abs(rects[e + 1][0] - (rects[e][0] + rects[e][2])) < 0.01) e++
        const [x, y, , h] = rects[s], w = rects[e][0] + rects[e][2] - x
        /* a run of cells as one stroke along its middle, as thick as the row */
        if (!byH.has(h)) byH.set(h, '')
        byH.set(h, byH.get(h) + `M${num(x - X)} ${num(y - Y + h / 2)}h${num(w)}`)
        s = e + 1
      }
      for (const [h, d] of byH) g += `<path class="${c}" stroke-width="${num(h)}" d="${d}"/>`
    }
    for (const [c, list] of texts) g += textEls(c, list, l => Math.round(l[0]), l => Math.round(l[1]), l => l[2])
    frames.push(g + arcs)
  }
  /* the rings and drops of the catch: born when and where, relative to the click */
  const { rings } = pond.fx()
  const drops = [...seen.values()]
  let css = ''
  for (const [key, name] of classes) {
    const [color, a] = key.slice(1).split('/')
    css += key[0] === 'f' ? `.${name}{fill:${color};fill-opacity:${a}}` : key[0] === 'r' ? `.${name}{stroke:${color};stroke-opacity:${a}}` : `.${name}{stroke:${color};stroke-opacity:${a};fill:none;stroke-linecap:round}`
  }
  return {
    css, frames,
    rings: rings.map(r => ({ x: num(r.x - X), y: num(r.y - Y), at: num(r.born - born), k: num(r.k), small: !!r.small })),
    drops: drops.map(d => ({ x0: num(d.x0 - X), y0: num(d.y0 - Y), x1: num(d.x1 - X), y1: num(d.y1 - Y), at: num(d.born - born), dur: num(d.dur) })),
  }
}

const KOI = {}
for (const name of Object.keys(WATERS)) {
  KOI[name] = bake(name)
  const total = KOI[name].css.length + KOI[name].defs.base.length + KOI[name].defs.frames.join('').length + KOI[name].net.length
  console.log(name, 'koi and water', total, 'characters')
}
const PAW = {}
for (const name of Object.keys(WATERS)) {
  PAW[name] = { top: bakePaw(name, true), bottom: bakePaw(name, false) }
  const p = PAW[name].top
  console.log(name, 'paw', p.frames.length, 'frames,', p.frames.join('').length + p.css.length, 'characters')
}
const DIGITS = {}
for (const [ch, m] of Object.entries(MARKS.digits)) DIGITS[ch] = { def: markDef(ch === ':' ? 'kc' : `k${ch}`, m, 7, 9, 1, 0), adv: num(m.width) }
const DAYS = {}
for (const [w, m] of Object.entries(MARKS.days)) DAYS[w] = { def: markDef('day', m, 4, 5, 0.88, 5), width: num(m.width), height: num(m.rows * 5), top: num(m.oy) }
console.log('digits', Object.values(DIGITS).reduce((a, d) => a + d.def.length, 0), 'characters; longest day', Math.max(...Object.values(DAYS).map(d => d.def.length)))
writeFileSync(
  OUT,
  `/* Generated by tools/bake.mjs from ASCII Koi's pond.js and AsciiMark. Do not edit by hand: run node tools/bake.mjs. */\n` +
    `export const WATERS = ${JSON.stringify(WATERS)} as const\n` +
    `export const FRAMES = ${F}\nexport const BEAT = ${BEAT}\n` +
    `export const DESIGNS = ${JSON.stringify(DESIGNS.map(d => ({ angle: d.angle, depth: d.depth })))} as const\n` +
    `export const KOI: Record<string, { css: string; defs: { base: string; frames: string[] }; net: string }> = ${JSON.stringify(KOI, null, 1)}\n` +
    `export const MARK_CSS = ${JSON.stringify(markClasses())}\n` +
    `export const DIGITS: Record<string, { def: string; adv: string }> = ${JSON.stringify(DIGITS, null, 1)}\n` +
    `export const DAYS: Record<string, { def: string; width: string; height: string; top: string }> = ${JSON.stringify(DAYS, null, 1)}\n` +
    `export const PAW_FPS = ${PAW_FPS}\n` +
    `export const PAW: Record<string, { top: Paw; bottom: Paw }> = ${JSON.stringify(PAW, null, 1)}\n` +
    `type Paw = { css: string; frames: string[]; rings: { x: string; y: string; at: string; k: string; small: boolean }[]; drops: { x0: string; y0: string; x1: string; y1: string; at: string; dur: string }[] }\n`,
)
