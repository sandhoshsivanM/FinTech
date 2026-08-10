#!/usr/bin/env node
/**
 * Khazana design-spec builder.
 *
 * Assembles every page module into one HTML document, then prints it with the
 * Chromium that is already on this machine (Playwright's cached download) —
 * no new dependency, nothing installed. `--print-to-pdf` respects the
 * `@page { size }` in doc.css, so the sheet geometry lives with the styling
 * rather than in a flag here.
 *
 *   node docs/design-spec/build.mjs            # html + pdf
 *   node docs/design-spec/build.mjs --html     # html only (fast iteration)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

import { FOLIO } from './src/doc.js';
import { PAGES } from './src/manifest.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_HTML = join(HERE, 'index.html');
const OUT_PDF = join(HERE, 'Khazana_Design_Spec.pdf');

/** Locate the cached Chromium, whichever build revision is present. */
function findChromium() {
  const root = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(root)) return null;
  const revs = readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const rev of revs) {
    for (const app of ['Google Chrome for Testing.app', 'Chromium.app']) {
      const bin = join(root, rev, 'chrome-mac-arm64', app, 'Contents/MacOS', app.replace('.app', ''));
      if (existsSync(bin)) return bin;
      const bin2 = join(root, rev, 'chrome-mac', app, 'Contents/MacOS', app.replace('.app', ''));
      if (existsSync(bin2)) return bin2;
    }
  }
  return null;
}

// ---- Assemble -------------------------------------------------------------
const pages = PAGES.flat();

// Folios are placeholders until now so that inserting a page never means
// renumbering the ones after it.
let n = 0;
let numbered = pages.map((html) => html.replace(FOLIO, () => String(++n)));

// The contents page cites the sheet each part opens on. Deriving those numbers
// from the manifest is the only way they stay true — a hand-typed contents page
// is wrong the first time a sheet is inserted anywhere above it.
const PART_KEYS = ['0', 'A', 'B', 'C', 'D', 'E', 'F'];
let at = 1;
const starts = {};
PAGES.forEach((part, i) => {
  if (PART_KEYS[i]) starts[PART_KEYS[i]] = at;
  at += part.length;
});
numbered = numbered.map((html) =>
  html.replace(/<!--PAGE:([0A-F])-->/g, (_, k) => String(starts[k] ?? '—')));

const css = ['src/tokens.css', 'src/doc.css']
  .map((f) => readFileSync(join(HERE, f), 'utf8'))
  .join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Khazana — Design Specification</title>
<style>
${css}
</style>
</head>
<body>
${numbered.join('\n')}
</body>
</html>
`;

writeFileSync(OUT_HTML, html);
console.log(`html   ${OUT_HTML}  (${numbered.length} pages, ${(html.length / 1024).toFixed(0)} KB)`);

if (process.argv.includes('--html')) process.exit(0);

// ---- Print ----------------------------------------------------------------
const chrome = findChromium();
if (!chrome) {
  console.error('No cached Chromium found under ~/Library/Caches/ms-playwright.');
  process.exit(1);
}

execFileSync(chrome, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--no-pdf-header-footer',
  '--run-all-compositor-stages-before-draw',
  // Fonts are loaded from disk and the document is static, but the virtual
  // clock still has to be given room or Chromium prints before @font-face
  // resolves and every page falls back to the system face.
  '--virtual-time-budget=20000',
  `--print-to-pdf=${OUT_PDF}`,
  `file://${OUT_HTML}`,
], { stdio: ['ignore', 'ignore', 'inherit'] });

const bytes = readFileSync(OUT_PDF).length;
console.log(`pdf    ${OUT_PDF}  (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
