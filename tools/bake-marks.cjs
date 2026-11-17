/*
 * Bakes the clock's digits and the weekday words in ASCII Koi's character
 * cells into tools/marks.json, in Chromium, with ASCII Koi's own font.
 *   node tools/bake-marks.cjs
 * Needs Playwright with Chromium. tools/bake.mjs reads the result.
 */
const { chromium } = require('playwright')
const { writeFileSync } = require('fs')
const path = require('path')
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto('file://' + path.join(__dirname, 'marks.html'))
  const out = await page.evaluate(async () => {
    /* ASCII Koi's desktop sizes: the clock at 230 px in 7 x 9 cells, at most 820 wide; the day at 84 px in 4 x 5, at most 420 */
    const TITLE = '700 230px "Noto Serif Display"', TAG = '700 84px "Noto Serif Display"'
    await document.fonts.load(TITLE, '0123456789:')
    const s = scaleFor('00:00', TITLE, 820)
    const digits = {}
    for (const d of '0123456789:') digits[d] = await bake(d, TITLE, 7, 9, s)
    const days = {}
    for (const w of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
      days[w] = await bake(w, TAG, 4, 5, scaleFor(w, TAG, 420))
    }
    return { scale: s, digits, days }
  })
  await browser.close()
  writeFileSync(path.join(__dirname, 'marks.json'), JSON.stringify(out))
  const n = o => Object.values(o).map(v => v.cells.length)
  console.log('scale', out.scale.toFixed(3), 'digit cells', n(out.digits).join(' '), 'day cells', n(out.days).join(' '))
})()
