#!/usr/bin/env node
/**
 * Token parity guard.
 *
 * `src/tokens.css` is a hand-maintained copy of the app's `globals.css` with the
 * theme selectors rewritten, which means it can rot. This asserts that every
 * colour literal the app publishes also appears in the spec's copy — so a token
 * changed in the app and not here fails loudly instead of producing a document
 * that quietly describes a product that no longer exists.
 *
 * It checks INCLUSION, not equality: tokens.css legitimately carries values
 * globals.css does not (both palettes are flattened into one file, and the
 * document adds nothing of its own).
 *
 *   node docs/design-spec/check-tokens.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '../../webapp/src/app/globals.css');
const SPEC = join(HERE, 'src/tokens.css');

const app = readFileSync(APP, 'utf8');
const spec = readFileSync(SPEC, 'utf8').toLowerCase();

/** Strip comments so a hex mentioned only in prose is not treated as a token. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const hexes = new Set((strip(app).match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase()));
const rgbas = new Set(
  (strip(app).match(/rgba?\([^)]*\)/g) ?? []).map((s) => s.replace(/\s+/g, '').toLowerCase()),
);

const specNoWs = spec.replace(/\s+/g, '');

const missingHex = [...hexes].filter((h) => !spec.includes(h));
const missingRgba = [...rgbas].filter((r) => !specNoWs.includes(r));

// Structural invariants worth failing on independently of colour.
const invariants = [
  [/--radius-card:\s*14px/, '--radius-card: 14px'],
  [/--radius-btn:\s*9px/, '--radius-btn: 9px'],
  [/--radius-input:\s*10px/, '--radius-input: 10px'],
  [/--radius-modal:\s*18px/, '--radius-modal: 18px'],
  [/--nav-w:\s*248px/, '--nav-w: 248px'],
  [/--nav-rail:\s*76px/, '--nav-rail: 76px'],
  [/--top-h:\s*64px/, '--top-h: 64px'],
  [/cubic-bezier\(0\.4,\s*0,\s*0\.2,\s*1\)/, 'standard easing curve'],
  [/--dur-fast:\s*150ms/, '--dur-fast: 150ms'],
  [/--dur:\s*250ms/, '--dur: 250ms'],
  [/--dur-slow:\s*400ms/, '--dur-slow: 400ms'],
];

const brokenInvariants = invariants
  .filter(([re]) => re.test(app) && !re.test(readFileSync(SPEC, 'utf8')))
  .map(([, label]) => label);

// The categorical order is the accessibility mechanism, so it is checked as a
// sequence rather than as a set of values.
const seq = (src) => {
  const m = src.match(/--c1:\s*(#[0-9a-fA-F]{6});\s*--c2:\s*(#[0-9a-fA-F]{6});\s*--c3:\s*(#[0-9a-fA-F]{6});\s*--c4:\s*(#[0-9a-fA-F]{6});[\s\S]*?--c5:\s*(#[0-9a-fA-F]{6});\s*--c6:\s*(#[0-9a-fA-F]{6});\s*--c7:\s*(#[0-9a-fA-F]{6});\s*--c8:\s*(#[0-9a-fA-F]{6});/);
  return m ? m.slice(1, 9).map((h) => h.toLowerCase()).join(' ') : null;
};
const appSeq = seq(app);
const specSeq = seq(readFileSync(SPEC, 'utf8'));
const seqOk = appSeq && appSeq === specSeq;

// ---- Report ---------------------------------------------------------------
let failed = false;

const report = (label, bad) => {
  if (bad.length) {
    failed = true;
    console.error(`\n✗ ${label} (${bad.length})`);
    for (const b of bad) console.error(`    ${b}`);
  } else {
    console.log(`✓ ${label}`);
  }
};

console.log(`globals.css  ${hexes.size} hex · ${rgbas.size} rgba`);
report('every app hex present in tokens.css', missingHex);
report('every app rgba present in tokens.css', missingRgba);
report('structural invariants', brokenInvariants);

if (seqOk) {
  console.log('✓ categorical series order unchanged');
} else {
  failed = true;
  console.error('\n✗ categorical series order');
  console.error(`    app:  ${appSeq}`);
  console.error(`    spec: ${specSeq}`);
}

if (failed) {
  console.error('\nThe design spec has drifted from the app. Update docs/design-spec/src/tokens.css,');
  console.error('then rebuild with: node docs/design-spec/build.mjs\n');
  process.exit(1);
}
console.log('\nDesign spec is in step with the app.');
