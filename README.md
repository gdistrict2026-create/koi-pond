# Koi Pond

ASCII Koi behind your conversations in the Claude desktop app: big koi drawn in character tiles swim across black water under ASCII Koi's clock, day and date. Click the pond and the cat's paw reaches in; or throw food.

The koi, the paw and the clock's digits are baked from ASCII Koi's own engine and font ([pursurer/ascii-koi](https://github.com/pursurer/ascii-koi), MIT), so they look the same.

## Why it keeps moving

The app holds a backdrop still when it takes too long to draw. This one is built to stay far under that:

- every koi moves one whole cell at a time, meandering on a gentle S-curve and surging and gliding as pond.js's koi do, with every step on one shared tick five times a second, so the app repaints five times a second and holds still in between;
- the clock changes by CSS on the minute, with no redraws;
- no blur, filters, gradients or masks; it measured 60 fps at full speed and about 37 fps with the CPU slowed six times (the koi-backdrop scene measured 35 and 9 on the same test).

## Install

From a terminal, in the folder that holds `koi-pond`:

```
claude plugin marketplace add ./koi-pond
claude plugin install koi-pond@koi-pond
```

Turn off koi-backdrop if you have it (two backdrops fight over one theme), then start a new session.

## Use

| | |
|---|---|
| Click the pond | The cat's paw comes in from the nearer edge, with its rings and drops |
| `/pond feed` | A handful of food lands on the water, floats, then sinks |
| `/pond paw` | The cat paw reaches in (handy when the chat covers the pond) |
| `/pond tap paw` or `/pond tap feed` | What a click does |
| `/pond black`, `/pond blue`, `/pond white` | The water (black by default) |
| `/pond glass <blur 0-64> <opacity 0-1>` | How the app's panels veil the pond; blur 0 is smoothest |
| `/pond off`, `/pond on` | Take the pond away, bring it back |

## Limits

A backdrop can run no code, so the koi do not chase the food or flee the paw, and only a left click reaches it. A click or `/pond feed` sends the scene again, which can blink once. Under Reduce Motion the koi rest and the clock shows the time the scene was made.

## Rebuilding

`node tools/bake-marks.cjs` (needs Playwright) bakes the clock's digits; `node tools/bake.mjs` bakes the koi, the water and the paw into `hooks/scenes.ts`.

## Licence

MIT. `tools/pond.js` is ASCII Koi's engine (MIT, see `tools/LICENSE.ascii-koi`); the fonts in `tools/fonts` are under the SIL Open Font License.
