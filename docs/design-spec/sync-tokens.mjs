#!/usr/bin/env node
/**
 * Regenerates `src/tokens.css` from the app's `globals.css`.
 *
 * `tokens.css` used to be a hand-maintained transcription, and `check-tokens.mjs`
 * existed to catch it rotting — which it did, the moment the palette moved. A
 * guard that reports drift is good; not being able to drift is better, so the
 * copy is now generated and the guard becomes a check on this script rather
 * than on somebody's diligence.
 *
 * The only transformation is the SELECTOR. The app themes on
 * `:root[data-theme]`, which permits exactly one theme per document. The spec
 * needs Vault and Ledger side by side on one sheet, so the two palettes are
 * republished as `.thm-light` / `.thm-dark` classes that nest anywhere.
 *
 *   node docs/design-spec/sync-tokens.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '../../webapp/src/app/globals.css');
const OUT = join(HERE, 'src/tokens.css');

const css = readFileSync(APP, 'utf8');

/**
 * Pulls one balanced `selector { … }` block out of the stylesheet.
 *
 * Brace-counting rather than a regex: these blocks contain comments and nested
 * function syntax, and a lazy `[\s\S]*?}` stops at the first `}` inside a
 * gradient or a comment.
 */
function block(selector, from = 0) {
  const start = css.indexOf(selector, from);
  if (start < 0) throw new Error(`Selector not found in globals.css: ${selector}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return { body: css.slice(open + 1, i), end: i };
    }
  }
  throw new Error(`Unbalanced block for ${selector}`);
}

// globals.css publishes three token blocks in order: the light palette, the
// dark palette, then the theme-invariant scale.
const light = block(':root {');
const dark = block(':root[data-theme="dark"] {');
const invariant = block(':root {', dark.end);

const header = `/* ============================================================================
   KHAZANA DESIGN TOKENS — spec-document edition

   GENERATED. Do not edit by hand.

       node docs/design-spec/sync-tokens.mjs

   Every value is lifted verbatim from webapp/src/app/globals.css, so this
   document cannot describe a product that no longer exists. \`check-tokens.mjs\`
   still runs in the build as a second pair of eyes.

   The one transformation is the SELECTOR: the app themes on
   \`:root[data-theme]\`, which allows exactly one theme per document, and a spec
   needs Vault and Ledger side by side on the same sheet.
   ========================================================================= */
`;

const out = [
  header,
  '/* ======================= LEDGER — the light theme ======================= */',
  `.thm-light {${light.body}}`,
  '',
  '/* ======================== VAULT — the dark theme ========================= */',
  `.thm-dark {${dark.body}}`,
  '',
  '/* ============ Theme-invariant: identical in both palettes ================ */',
  `:root {${invariant.body}}`,
  '',
].join('\n');

writeFileSync(OUT, out);

const count = (s) => (s.match(/#[0-9a-fA-F]{6}\b/g) ?? []).length;
console.log(`tokens.css regenerated — ${count(out)} colour literals from globals.css`);
