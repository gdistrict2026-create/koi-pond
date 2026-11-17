import { expect, test, type TestBody } from 'claude-code/testing'

type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

const BACKDROP = {
  plugin: 'koi-pond',
  component: 'Backdrop',
  requestId: 'backdrop',
  props: { scene: 'pond', plugin: 'koi-pond', glass: { blur: 0, opacity: 0.55 } },
} as const

const NOW = Date.parse('2026-11-16T23:28:30')
const run = (args: string) => ({ command: 'pond', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })

const start = async ($: Engine, on: On, store: Record<string, unknown> = {}) => {
  on('clock.now', () => ({ value: NOW }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.after', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'pond' } }))
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => { store[e.key] = e.value; return { value: undefined } })
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 'backdrop' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}

test('the pond is one SVG document the app will keep animating', async ($, on) => {
  await start($, on)
  const ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  const source = String(svg?.props.source ?? '')
  expect(svg?.props.isInteractive).toBe(true)
  expect(source.startsWith('<svg')).toBe(true)
  expect(source).toContain('width="100%" height="100%"')
  // black water by default, the koi, the clock's digits and the date line
  expect(source).toContain('fill="#0d1315"')
  expect(source).toContain('id="d0f0"')
  expect(source).toContain('id="k0"')
  expect(source).toMatch(/\d{1,2} (JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER) \d{4}/)
  // under the app's limit, and nothing its check refuses
  expect(source.length).toBeLessThan(131073)
  expect(/(?:\d|\.)(?:[dsl]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max))(?![a-z0-9_-])/i.test(source)).toBe(false)
  expect(/shape-rendering|vector-effect|data:|url\(|var\(--|<image|CDATA|&|@font-face|@import/i.test(source)).toBe(false)
  expect(/href="(?!#)/.test(source)).toBe(false)
  const style = /<style>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? ''
  expect(style.includes('>') || style.includes('\\')).toBe(false)
  // the app reads "/*" anywhere as a CSS comment it refuses
  expect(source.includes('/*')).toBe(false)
  // every koi moves in steps, so the app repaints on a tick and holds still between
  expect(/@keyframes L\d\{0%\{transform:translate\([^)]*\);animation-timing-function:steps\(\d+\)\}/.test(style)).toBe(true)
  await ui.unmount()
})

test('/pond changes the water, throws food and sets what a click does; the terminal is left alone', async ($, on) => {
  const store: Record<string, unknown> = {}
  await start($, on, store)
  expect((await $.command.run(run('white'))).text).toBe('The koi swim in white water.')
  expect(store.water).toBe('white')
  expect((await $.command.run(run('tap feed'))).text).toBe('A click on the pond throws food there.')
  expect(store.tap).toBe('feed')
  expect((await $.command.run(run('feed'))).text).toBe('A handful of food lands on the water.')

  const ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
  const source = String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
  expect(source).toContain('fill="#e9e4da"')
  expect(source).toContain('@keyframes fp0x0')
  await ui.unmount()

  const term = await $.ui.mount({ ...BACKDROP, surface: 'terminal' })
  expect(await term.find({ type: 'Svg' })).toBeUndefined()
  await term.unmount()
})
