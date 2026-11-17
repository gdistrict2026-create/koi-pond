/*
 * The pond as one SVG document, assembled from the baked parts (scenes.ts).
 *
 * Every animation is stepped, and every delay is set from the wall clock:
 * - the clock's digits switch by CSS on the minute, so it keeps time with no
 *   redraws;
 * - a koi is where the wall clock says it is, so a document sent again (after
 *   a click, at midnight) carries on from the same picture.
 *
 * Under Reduce Motion the app takes the animation out: the koi rest across the
 * pond and the clock shows the time the document was made.
 */
import { BEAT, DAYS, DESIGNS, DIGITS, FRAMES, KOI, MARK_CSS, WATERS } from './scenes'

export type Water = 'blue' | 'black' | 'white'
export const WATER_NAMES = ['blue', 'black', 'white'] as const

export const W = 1600
export const H = 1000
const CW = 10

/*
 * The scene's tick: everything that moves changes on it together, five times a
 * second, so the app repaints five times a second and holds still in between.
 */
const TICK = 0.2
const SEG = 16 // cells in one stretch of a koi's lane at one speed
/* The pond's own view (the clock keeps W by H): smaller, so the koi draw about 1.5 times bigger, as on the web. */
const PW = 1100
const PH = 688
/*
 * Where each koi swims: its design (which also sets its heading), where it
 * rests under Reduce Motion, whether it swims deep and slow (2) or not (1),
 * and a phase.
 */
const LANES = [
  { d: 0, x: 180, y: 120, per: 1, off: 11.3 },
  { d: 1, x: 900, y: 560, per: 1, off: 47.9 },
  { d: 2, x: 330, y: 600, per: 2, off: 23.1 },
  { d: 0, x: 760, y: 300, per: 2, off: 5.7 },
  { d: 1, x: 420, y: 330, per: 1, off: 71.2 },
  { d: 2, x: 980, y: 160, per: 1, off: 34.6 },
]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

const num = (v: number) => String(Math.round(v * 100) / 100)
/* a delay that puts a cycle of `period` seconds at phase `x`: in (-period, 0] */
const at = (x: number, period: number) => num(-((((x % period) + period) % period)))
/* the same, on the tick: every step of every animation then falls on a tick */
const onTick = (x: number, period: number) => at(Math.round(x / TICK) * TICK, period)

/* a mix of two #rrggbb colours */
function mix(a: string, b: string, k: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2].map(i => Math.round(p(a, i) + (p(b, i) - p(a, i)) * k).toString(16).padStart(2, '0')).join('')
}

/* What a click or /pond feed adds for a while: its own style, defs and drawing, laid over the koi. */
export type Overlay = { css: string; defs: string; body: string }

/*
 * `lean` (while a paw plays): one swim frame per koi instead of all of them,
 * which makes room in the document for the paw's frames.
 */
export function buildScene(water: Water, nowMs: number, opts: { overlay?: Overlay; lean?: boolean } = {}): { svg: string; alt: string } {
  const { overlay, lean = false } = opts
  const pal = WATERS[water]
  const koi = KOI[water]!
  const t = nowMs / 1000
  const date = new Date(nowMs)
  const S = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000

  /* ── animations ── */
  let css =
    `.f{opacity:0;animation:f ${BEAT}s step-end infinite}.f0{opacity:1}` +
    `@keyframes f{0%{opacity:1}${num(100 / FRAMES)}%{opacity:0}to{opacity:0}}` +
    `.N{animation:N 72s steps(8) infinite alternate}@keyframes N{from{transform:translate(0px,0px)}to{transform:translate(80px,52px)}}` +
    /* the clock: a minute's digit shows for a tenth of ten minutes, a ten's for a sixth of an hour, an hour for a 24th of a day */
    '.c1{opacity:0;animation:c1 600s step-end infinite}@keyframes c1{0%{opacity:1}10%{opacity:0}to{opacity:0}}' +
    '.c2{opacity:0;animation:c2 3600s step-end infinite}@keyframes c2{0%{opacity:1}16.6667%{opacity:0}to{opacity:0}}' +
    '.c3{opacity:0;animation:c3 86400s step-end infinite}@keyframes c3{0%{opacity:1}4.16667%{opacity:0}to{opacity:0}}' +
    '.on{opacity:1}'

  /* ── the koi, deepest first ── */
  let fish = ''
  const order = LANES.map((l, i) => ({ ...l, i })).sort((a, b) => DESIGNS[a.d]!.depth - DESIGNS[b.d]!.depth)
  for (const l of order) {
    /*
     * As pond.js's koi swim: along a gentle S-curve about the heading, surging
     * and gliding with the beat of the tail. Still one whole cell across per
     * step, every step on the tick: each stretch of SEG cells takes 1 tick a
     * cell (a surge, 50 view px/s) or 2 (a glide, 25), as pond.js's speed runs
     * from about 0.65 to 1.35 of a koi's cruise; a deep koi is a tick slower.
     */
    const rad = (DESIGNS[l.d]!.angle * Math.PI) / 180, dir = Math.cos(rad) > 0 ? 1 : -1, slope = Math.tan(rad)
    const start = dir > 0 ? -40 : PW + 40
    const end = dir > 0 ? PW + 420 : -420
    const segs = Math.ceil(Math.abs(end - start) / CW / SEG)
    const pos = (j: number) => {
      const x = start + dir * j * SEG * CW
      return `translate(${x - l.x}px,${num((x - l.x) * slope + 26 * Math.sin((2 * Math.PI * j * SEG * CW) / 760 + l.off))}px)`
    }
    const keys: string[] = []
    let cross = 0
    for (let j = 0; j < segs; j++) {
      const beat = 0.5 + 0.5 * Math.sin((2 * Math.PI * j) / 4.5 + l.off * 1.7)
      keys.push(`${cross}`, pos(j))
      cross += SEG * (l.per + (beat > 0.5 ? 0 : 1)) * TICK
    }
    cross = Math.round(cross * 10) / 10
    let frames = ''
    for (let k = 0; k < keys.length; k += 2) frames += `${num((Number(keys[k]) / cross) * 100)}%{transform:${keys[k + 1]};animation-timing-function:steps(${SEG})}`
    css += `.L${l.i}{animation:L${l.i} ${num(cross)}s linear infinite}@keyframes L${l.i}{${frames}to{transform:${pos(segs)}}}`
    let uses = lean ? `<use href="#d${l.d}f0"/>` : ''
    for (let k = 0; !lean && k < FRAMES; k++) {
      uses += `<use href="#d${l.d}f${k}" class="f${k === 0 ? ' f0' : ''}" style="animation-delay:${onTick(t + l.off - (k * BEAT) / FRAMES, BEAT)}s"/>`
    }
    fish += `<g class="L${l.i}" style="animation-delay:${onTick(t + l.off * 7, cross)}s"><g transform="translate(${l.x} ${l.y})">${uses}</g></g>`
  }

  /* ── the clock, the day and the date, laid out as ASCII Koi's intro box ── */
  const from = pal.dark ? '#ffffff' : '#000000'
  const to = pal.dark ? '#9b9b9b' : '#666666'
  const adv = Number(DIGITS['0']!.adv), colon = Number(DIGITS[':']!.adv)
  const total = 4 * adv + colon
  const pens = [0, adv, 2 * adv, 2 * adv + colon, 3 * adv + colon]
  pens.forEach((p, i) => { css += `.q${i}{color:${mix(from, to, (p + (i === 2 ? colon : adv) / 2) / total)}}` })
  for (let b = 0; b < 5; b++) css += `.b${b}{color:${mix(from, to, (b + 0.5) / 5)}}`
  css += `.mw{fill:${pal.water};fill-opacity:0.24}` + MARK_CSS

  const day = DAYS[DAY_NAMES[date.getDay()]!]!
  const titleH = 21 * 9, tagH = Number(day.height), lineH = 18
  const top = (H - (titleH + 6 + tagH + 14 + lineH)) / 2
  const baseline = top + 176
  const x0 = W / 2 - total / 2
  const hh = date.getHours(), mm = date.getMinutes()
  let clock = ''
  for (let h = 0; h < 24; h++) {
    const s = String(h).padStart(2, '0')
    clock +=
      `<g class="c3${h === hh ? ' on' : ''}" style="animation-delay:${at(S - 3600 * h, 86400)}s">` +
      `<use href="#k${s[0]}" x="${num(x0 + pens[0]!)}" y="${num(baseline)}" class="q0"/><use href="#k${s[1]}" x="${num(x0 + pens[1]!)}" y="${num(baseline)}" class="q1"/></g>`
  }
  clock += `<use href="#kc" x="${num(x0 + pens[2]!)}" y="${num(baseline)}" class="q2"/>`
  for (let d = 0; d < 6; d++) {
    clock += `<use href="#k${d}" x="${num(x0 + pens[3]!)}" y="${num(baseline)}" class="q3 c2${d === Math.floor(mm / 10) ? ' on' : ''}" style="animation-delay:${at(S - 600 * d, 3600)}s"/>`
  }
  for (let d = 0; d < 10; d++) {
    clock += `<use href="#k${d}" x="${num(x0 + pens[4]!)}" y="${num(baseline)}" class="q4 c1${d === mm % 10 ? ' on' : ''}" style="animation-delay:${at(S - 60 * d, 600)}s"/>`
  }
  const tagTop = top + titleH + 6
  clock += `<use href="#day" x="${num(W / 2 - Number(day.width) / 2)}" y="${num(tagTop - Number(day.top))}"/>`
  const dateText = `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
  clock += `<text x="${W / 2}" y="${num(tagTop + tagH + 14 + lineH / 2)}" font-size="13" font-weight="400" letter-spacing="3.12" fill="${pal.ink}" fill-opacity="0.8">${dateText}</text>`

  const animated = ['f', 'N', 'c1', 'c2', 'c3', ...LANES.map((_, i) => `L${i}`)]
  css += koi.css + `@media (prefers-reduced-motion: reduce){${animated.map(c => '.' + c).join(',')}{animation:none}}`
  if (overlay) css += overlay.css

  const digitDefs = Object.values(DIGITS).map(d => d.def).join('')
  /*
   * The pond and the clock each fill the window as ASCII Koi's do (a 1600 by
   * 1000 view, cropped to the window's shape); between them, in the window's
   * own pixels, whatever a click added, placed where the click was.
   */
  const view = (w: number, h: number) => `width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"`
  const koiDefs = koi.defs.base + (lean ? koi.defs.frames[0]! : koi.defs.frames.join(''))
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="position:fixed;top:0;left:0;width:100%;height:100%">` +
    `<style>${css}</style>` +
    `<rect width="100%" height="100%" fill="${pal.water}"/>` +
    `<g font-family="ui-monospace,Menlo,Consolas,monospace" font-size="10" font-weight="600" text-anchor="middle" dominant-baseline="central">` +
    `<svg ${view(PW, PH)}>` +
    `<defs>${koiDefs}${digitDefs}${day.def}${overlay ? overlay.defs : ''}</defs>` +
    `<g class="N"><g transform="translate(-80 -52)">${koi.net}</g></g>` +
    fish +
    `</svg>` +
    (overlay ? overlay.body : '') +
    `<svg ${view(W, H)}>${clock}</svg>` +
    `</g></svg>`

  return { svg, alt: `ASCII koi drawn in text characters swim in ${water} water under a clock reading ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}, ${DAY_NAMES[date.getDay()]} ${dateText.toLowerCase()}.` }
}
