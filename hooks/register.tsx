/*
 * Koi pond: ASCII Koi behind the conversation in the Claude desktop app, with
 * its clock and date. A click on the pond sends the cat's paw in (or throws
 * food: /pond tap feed).
 *
 *   /pond                          says what is on
 *   /pond black|blue|white         changes the water
 *   /pond feed, /pond paw          throws food, or sends the paw in
 *   /pond tap paw|feed             what a click on the pond does
 *   /pond glass <blur> <opacity>   how the app's panels veil the pond
 *   /pond off, /pond on
 *
 * The scene is sent again only when something changes (a click, a command,
 * midnight, a wake from sleep); everything in it is timed from the wall clock,
 * so each new copy carries on from the same picture.
 */
import type { EngineInterface, Register } from 'claude-code'

import { LIFE, overlays, type Event } from './fx'
import { buildScene, WATER_NAMES, type Water } from './scene'
import { WATERS } from './scenes'

const SCENE = 'pond'
const LIMIT = 131072 // the most characters the app takes in a scene

type Glass = { blur: number; opacity: number }
type Tap = 'paw' | 'feed'
type Settings = { water: Water; glass: Glass; tap: Tap }

/* No blur by default: a blur over a moving scene is redone on every change. A plain tint keeps the words readable. */
const GLASS: Glass = { blur: 0, opacity: 0.55 }

const isWater = (v: unknown): v is Water => typeof v === 'string' && (WATER_NAMES as readonly string[]).includes(v)

let events: Event[] = []
let isOn = true

async function stored($: EngineInterface): Promise<Settings> {
  const [w, g, tap] = await Promise.all([$.store.get('water'), $.store.get('glass'), $.store.get('tap')])
  const glass = g && typeof g === 'object' ? (g as Partial<Glass>) : {}

  return {
    water: isWater(w) ? w : 'black',
    glass: {
      blur: typeof glass.blur === 'number' ? glass.blur : GLASS.blur,
      opacity: typeof glass.opacity === 'number' ? glass.opacity : GLASS.opacity,
    },
    tap: tap === 'feed' ? 'feed' : 'paw',
  }
}

async function show($: EngineInterface, now: Settings) {
  isOn = true
  const set = await $.theme.set({
    overrideColorScheme: now.water === 'white' ? 'light' : 'dark',
    backdrop: { scene: SCENE, glass: { ...now.glass, tint: WATERS[now.water].water } },
  })
  $.ui.invalidate('ui.render')

  return set
}

/* The scene at `now`, with what is still playing; food goes first, then the paw, if the app's limit needs the room. */
function scene(water: Water, now: number) {
  events = events.filter(e => now - e.at < LIFE[e.kind])
  for (const keep of [events, events.filter(e => e.kind === 'paw'), []]) {
    const fx = overlays(keep, water, now)
    const s = buildScene(water, now, { overlay: fx.overlay, lean: fx.hasPaw })
    if (s.svg.length <= LIMIT) return s
  }
  return buildScene(water, now)
}

/* A paw or food from now on; when a paw is done, the scene goes back to every swim frame. */
function drop($: EngineInterface, kind: Event['kind'], x: number, y: number, at: number) {
  events.push({ kind, x, y, at })
  $.ui.invalidate('ui.render')
  if (kind === 'paw') $.clock.after(LIFE.paw + 100, () => $.ui.invalidate('ui.render'))
}

/* Somewhere on the open water, away from the clock in the middle. */
const somewhere = (seed: number) => ({ x: 0.12 + ((seed * 7) % 23) / 23 * 0.76, y: (seed % 2 ? 0.18 : 0.8) + ((seed * 3) % 7) / 100 })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pond',
      description: 'The koi pond behind the conversation: water, food, what a click does',
      argumentHint: '[black|blue|white|feed|paw|tap paw|tap feed|glass <blur> <opacity>|off|on]',
    })
    /* neither a reload nor a resume keeps a theme, so it is set here every time */
    await show($, await stored($))

    /* a new day redraws the date; a minute that took far longer than a minute (sleep) puts the clock right */
    let last = await $.clock.now()
    $.clock.every(60_000, () => {
      void $.clock.now().then(now => {
        const late = now - last > 90_000, newDay = new Date(now).getDate() !== new Date(last).getDate()
        last = now
        if (isOn && (late || newDay)) $.ui.invalidate('ui.render')
      })
    })

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.props.plugin !== $.plugin.name || e.props.scene !== SCENE) return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    const [now, settings] = await Promise.all([$.clock.now(), stored($)])
    const { svg, alt } = scene(settings.water, now)
    const { Svg } = $.ui.resolve(e)

    /* isInteractive: the app draws it in a frame of its own, where its CSS animation runs */
    return <Svg isInteractive source={svg} alt={alt} />
  })

  /* A click on the bare pond: the paw comes in from the nearer edge, or a handful of food lands there. */
  on('ui.pointer', async ($, e, next) => {
    if (e.scene !== SCENE || !isOn) return next(e)
    const [now, settings] = await Promise.all([$.clock.now(), stored($)])
    drop($, settings.tap === 'feed' ? 'food' : 'paw', e.x, e.y, now)

    return next(e)
  })

  on('command.run', { command: 'pond' }, async ($, e) => {
    const [word = '', ...rest] = e.args.trim().toLowerCase().split(/\s+/)
    const now = await stored($)
    const nothing = (reason: string) => `Saved. Nothing draws it here: ${reason}`

    if (isWater(word)) {
      await $.store.set('water', word)
      const set = await show($, { ...now, water: word })

      return { text: set.isDrawn ? `The koi swim in ${word} water.` : nothing(set.reason) }
    }
    if (word === 'feed' || word === 'paw') {
      const at = await $.clock.now(), spot = somewhere(Math.floor(at / 1000))
      drop($, word === 'feed' ? 'food' : 'paw', spot.x, spot.y, at)

      return { text: word === 'feed' ? 'A handful of food lands on the water.' : 'The cat paw reaches into the pond.' }
    }
    if (word === 'tap') {
      if (rest[0] !== 'paw' && rest[0] !== 'feed') return { text: `A click on the pond does: ${now.tap}. Set it with /pond tap paw or /pond tap feed.` }
      await $.store.set('tap', rest[0])

      return { text: rest[0] === 'paw' ? 'A click on the pond sends the cat paw in.' : 'A click on the pond throws food there.' }
    }
    if (word === 'glass') {
      const blur = Number(rest[0]), opacity = Number(rest[1])
      if (!(blur >= 0 && blur <= 64) || !(opacity >= 0 && opacity <= 1)) {
        return { text: `Glass is blur ${now.glass.blur}, opacity ${now.glass.opacity}. Set it with /pond glass <blur 0-64> <opacity 0-1>. Blur 0 keeps the pond smoothest.` }
      }
      await $.store.set('glass', { blur, opacity })
      const set = await show($, { ...now, glass: { blur, opacity } })

      return { text: set.isDrawn ? `Glass: blur ${blur}, opacity ${opacity}.` : nothing(set.reason) }
    }
    if (word === 'off') {
      /* the person asked: the one case that clears the session's theme */
      isOn = false
      await $.theme.clear()

      return { text: 'The pond is off. /pond on brings it back.' }
    }
    if (word === 'on') {
      const set = await show($, now)

      return { text: set.isDrawn ? 'The pond is back.' : `Nothing draws it here: ${set.reason}` }
    }

    return { text: `Water: ${now.water}${isOn ? '' : ' (off)'}; a click: ${now.tap}; glass blur ${now.glass.blur}, opacity ${now.glass.opacity}. /pond black, blue or white; /pond feed; /pond paw; /pond tap paw|feed; /pond off.` }
  })
}
