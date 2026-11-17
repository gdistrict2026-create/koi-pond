import { expect, test } from 'claude-code/testing'

const BACKDROP = { plugin: 'koi-pond', component: 'Backdrop', requestId: 'backdrop', props: { scene: 'pond', plugin: 'koi-pond', glass: { blur: 0, opacity: 0.55 } } } as const
const run = (args: string) => ({ command: 'pond', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })

for (const water of ['black', 'blue', 'white']) {
  test(`in ${water} water, the paw and the food make scenes the engine accepts`, async ($, on) => {
    on('clock.now', () => ({ value: Date.parse('2026-11-16T23:28:30') }))
    on('clock.every', () => ({ value: undefined }))
    on('clock.after', () => ({ value: undefined }))
    on('command.register', () => ({ value: { command: 'pond' } }))
    on('store.get', (_, e) => ({ value: e.key === 'water' ? water : undefined }))
    on('theme.set', () => ({ value: { isDrawn: true, requestId: 'backdrop' } }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

    expect((await $.command.run(run('paw'))).text).toBe('The cat paw reaches into the pond.')
    let ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
    let source = String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
    expect(source).toContain('class="pf"') // the paw's frames
    expect(source.length).toBeLessThan(131073)
    await ui.unmount()

    // paw and food at once: the fullest scene there is
    expect((await $.command.run(run('feed'))).text).toBe('A handful of food lands on the water.')
    ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
    source = String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
    expect(source).toContain('class="pf"')
    expect(source.length).toBeLessThan(131073)
    expect(source.includes('/*')).toBe(false)
    await ui.unmount()
  })
}
