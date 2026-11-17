/*
 * What a click and /pond feed add to the pond for a while: ASCII Koi's cat
 * paw (baked from pond.js, frame by frame) with its rings and drops, or a
 * handful of fish food that lands, floats and sinks as pond.js's does.
 *
 * Each is placed where the person clicked, in the backdrop's own pixels, and
 * built with how long ago it began, so a scene sent again mid-way carries on
 * from the same moment.
 */
import { PAW, PAW_FPS, WATERS } from './scenes'
import type { Overlay, Water } from './scene'

export type Event = { kind: 'paw' | 'food'; x: number; y: number; at: number }

/* how long each lasts, in ms: the paw's rings fade by 3.3 s; food floats 16 s and sinks for 2.5 */
export const LIFE = { paw: 3400, food: 19000 } as const

const K = 1.85 // pond.js's koi scale on a wide window
const num = (v: number) => String(Math.round(v * 100) / 100)
const sec = (v: number) => num(v) + 's'

function rand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const mixRGB = (a: number[], b: number[], k: number) => '#' + a.map((v, i) => Math.round(v + (b[i]! - v) * k).toString(16).padStart(2, '0')).join('')
const hexRGB = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))

/* The rings pond.js draws on the water: line glyphs round the ring, and for a big one a fainter dotted ring behind. */
function ringCss(): string {
  const big0 = 26 * K, big1 = (2.6 * 74 + 26) * K, small0 = 4 * K, small1 = (1.2 * 34 + 4) * K
  const tiny0 = 4 * K * 0.45, tiny1 = (0.7 * 34 + 4) * K * 0.45
  return (
    '.rg{opacity:0;fill:none;stroke-width:1.4;stroke-dasharray:5 5}.rd{opacity:0;fill:none;stroke-width:2;stroke-linecap:round;stroke-dasharray:0.1 9}' +
    `@keyframes rb{from{r:${num(big0)}px;opacity:0.62}50%{opacity:0.22}to{r:${num(big1)}px;opacity:0}}` +
    `@keyframes rs{from{r:${num(small0)}px;opacity:0.45}50%{opacity:0.16}to{r:${num(small1)}px;opacity:0}}` +
    `@keyframes rt{from{r:${num(tiny0)}px;opacity:0.28}50%{opacity:0.1}to{r:${num(tiny1)}px;opacity:0}}` +
    `@keyframes r2{from{r:${num(big0)}px;opacity:0.32}50%{opacity:0.11}to{r:${num(big1 - 0.38 * 74 * K)}px;opacity:0}}`
  )
}

function pawPart(e: Event, water: Water, elapsed: number, n: number): Overlay {
  const pal = WATERS[water]
  const paw = PAW[water]![e.y <= 0.5 ? 'top' : 'bottom']
  const dot = pal.dark ? pal.koiLight : pal.ink
  const frame = 1 / PAW_FPS
  let body = ''
  paw.frames.forEach((f, k) => {
    body += `<g class="pf" style="animation-delay:${sec(k * frame - elapsed)}">${f}</g>`
  })
  for (const r of paw.rings) {
    const at = Number(r.at) - elapsed
    body += `<circle class="${r.small ? 'rd' : 'rg'}" cx="${r.x}" cy="${r.y}" r="1" stroke="${dot}" style="animation:${r.small ? 'rs 1.2s' : 'rb 2.6s'} linear ${sec(at)} 1 forwards"/>`
    if (!r.small) body += `<circle class="rd" cx="${r.x}" cy="${r.y}" r="1" stroke="${dot}" style="animation:r2 2.22s linear ${sec(at + 0.38)} 1 forwards"/>`
  }
  let css = ''
  paw.drops.forEach((d, j) => {
    const name = `dp${n}x${j}`
    css += `@keyframes ${name}{from{transform:translate(${d.x0}px,${d.y0}px);opacity:0.9}to{transform:translate(${d.x1}px,${d.y1}px);opacity:0.9}}`
    body += `<text class="dr" fill="${dot}" style="animation:${name} ${d.dur}s linear ${sec(Number(d.at) - elapsed)} 1">o</text>`
  })
  return {
    css: paw.css + css,
    defs: '',
    body: `<svg x="${num(e.x * 100)}%" y="${num(e.y * 100)}%" overflow="visible">${body}</svg>`,
  }
}

function foodPart(e: Event, water: Water, elapsed: number, n: number): Overlay {
  const pal = WATERS[water]
  const r = rand(e.at % 2147483647)
  const food = pal.dark ? [206, 142, 74] : [150, 92, 40]
  const top = mixRGB(food, [255, 236, 200], 0.35)
  const shadow = pal.dark ? '#000000' : mixRGB(hexRGB(pal.water), [0, 0, 0], 0.5)
  const dot = pal.dark ? pal.koiLight : pal.ink
  const pw = 6.2, ph = 6.24
  const count = 6 + Math.floor(r() * 3) // shortcut: pond.js throws 10-14; fewer keep a paw-and-food scene under the size cap
  let css = '', body = ''
  for (let j = 0; j < count; j++) {
    const a = r() * Math.PI * 2, d = (12 + 46 * Math.sqrt(r())) * K
    const tx = Math.cos(a) * d, ty = Math.sin(a) * d * 0.8
    const born = j * 0.012, dur = 0.28 + 0.2 * r(), land = born + dur
    const name = `fp${n}x${j}`
    /* thrown: bigger in the air, then down where it lands */
    css += `@keyframes ${name}{from{transform:translate(0px,0px) scale(1.9)}to{transform:translate(${num(tx)}px,${num(ty)}px) scale(1)}}`
    body +=
      `<g style="animation:${name} ${sec(dur)} ease-out ${sec(born - elapsed)} 1 both">` +
      `<g class="fd" style="animation-delay:${sec(-r() * 6 - elapsed)}">` +
      `<g class="fo" style="animation-delay:${sec(land + 16 - elapsed)}">` +
      `<rect x="${num(-pw / 2 + 2.5)}" y="${num(-ph / 2 + 3)}" width="${pw}" height="${ph}" fill="${shadow}" fill-opacity="${pal.dark ? 0.55 : 0.28}"/>` +
      `<rect x="${num(-pw / 2)}" y="${num(-ph / 2)}" width="${pw}" height="${ph}" fill="${mixRGB(food, food, 0)}"/>` +
      `<rect x="${num(-pw / 2)}" y="${num(-ph / 2)}" width="${pw}" height="${num(ph * 0.34)}" fill="${top}"/>` +
      `</g></g></g>` +
      `<circle class="rd" cx="${num(tx)}" cy="${num(ty)}" r="1" stroke="${dot}" style="animation:rt 0.7s linear ${sec(land - elapsed)} 1 forwards"/>`
  }
  return { css, defs: '', body: `<svg x="${num(e.x * 100)}%" y="${num(e.y * 100)}%" overflow="visible">${body}</svg>` }
}

/* Everything still alive at `now`, as one overlay; and whether a paw is among them (its scene then sends one swim frame per koi). */
export function overlays(events: readonly Event[], water: Water, now: number): { overlay?: Overlay; hasPaw: boolean } {
  const alive = events.filter(e => now - e.at < LIFE[e.kind])
  if (!alive.length) return { hasPaw: false }
  let css =
    ringCss() +
    `.pf{opacity:0;animation:pf ${num(1 / PAW_FPS)}s step-end 1}@keyframes pf{from{opacity:1}to{opacity:1}}` +
    '.dr{opacity:0;font-size:9px}' +
    '.fd{animation:fd 3s ease-in-out infinite alternate}@keyframes fd{from{transform:translate(-2px,-1px)}to{transform:translate(2px,1px)}}' +
    '.fo{animation:fo 2.5s linear 1 forwards}@keyframes fo{from{opacity:1}to{opacity:0}}'
  let body = ''
  alive.forEach((e, n) => {
    const part = (e.kind === 'paw' ? pawPart : foodPart)(e, water, (now - e.at) / 1000, n)
    css += part.css
    body += part.body
  })
  return { overlay: { css, defs: '', body }, hasPaw: alive.some(e => e.kind === 'paw') }
}
