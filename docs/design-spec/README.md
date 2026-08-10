# Khazana — Design Specification

`Khazana_Design_Spec.pdf` — 87 landscape sheets covering the web client end to end:
foundations, the component kit, all 28 screens in both themes, the phone at 390px, the
flows and motion rules, and the demo vault printed as reference data.

## Build

```sh
node docs/design-spec/build.mjs          # index.html + the PDF
node docs/design-spec/build.mjs --html   # HTML only, for fast iteration
node docs/design-spec/check-tokens.mjs   # assert the spec has not drifted from the app
node docs/design-spec/gen-icons.mjs      # re-bake Lucide glyphs (rarely needed)
```

No dependencies are installed. The PDF is printed by the Chromium already cached under
`~/Library/Caches/ms-playwright` via `--headless --print-to-pdf`, and Inter is embedded from
`assets/fonts/`. `index.html` is a build artefact — the PDF is the deliverable.

## How it is put together

Nothing here is a screenshot. Every artboard is redrawn from the design tokens, so a value in
the document and a value in `webapp/src/app/globals.css` cannot disagree — `check-tokens.mjs`
fails the build if they do.

```
build.mjs          assembles pages → index.html → Chromium → PDF; numbers folios and the contents
check-tokens.mjs   parity guard against webapp/src/app/globals.css
gen-icons.mjs      one-off codegen: Lucide geometry → src/icons.js
src/
  tokens.css       DERIVED from globals.css; both palettes scoped .thm-dark / .thm-light
  doc.css          the sheet itself — page, frame, callout, specimen chrome
  doc.js           page(), divider(), screenPage(), cal()
  manifest.js      page order — the one place that decides what the document contains
  data.js          the demo vault, verbatim, with every derived figure computed
  kit.js           the component kit, mirroring components/ui.tsx
  charts.js        donut · area · columns · bars · diverging · gauge · ring · spark · sunburst
  chrome.js        sidebar, topbar, bottom bar, phone frame
  icons.js         generated — do not hand-edit
  screens/*.js     29 artboards; each exports { art, meta }
  pages/*.js       front matter, foundations, components, screens, mobile, ux, appendix
```

The load-bearing trick: each artboard is authored **once** and rendered **twice**. `tokens.css`
republishes both palettes as classes instead of `:root[data-theme]`, so the Vault and Ledger
sheets come from one mockup source — which is only sound because the app's own rule is that
nothing but colour changes between themes.

## Adding a screen

1. Write `src/screens/<name>.js` exporting `[{ art, meta }]`. Build `art` with `shell()` from
   `chrome.js` at `h: 1200` — the height at which the 26-item sidebar fits without clipping.
2. Register it in `src/pages/screens.js`.
3. Rebuild. Folios and the contents page renumber themselves.

Take every figure from `data.js`. If a number is not there, compute it there rather than typing
it into an artboard — several hardcoded counts had already drifted from the data by the time the
first draft printed.

## Caveats

- Specifies the **web client**. The Flutter app shares the tokens, the algorithms and the
  five-tab bar, but carries a 19-item desktop sidebar and two screens the web build does not.
- Contrast figures in Part E are computed from token pairs. **No assistive-technology pass has
  been run** against the live build.
- `sampleData.ts` seeds a snapshot series ending at a hardcoded ₹5.24 Cr while its holdings and
  accounts compute to ₹2.19 Cr. This document uses the computed figure and scales the curve onto
  it; Part F records the discrepancy, which is worth fixing in the seed.
