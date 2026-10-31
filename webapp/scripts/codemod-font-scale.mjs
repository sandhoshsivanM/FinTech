// One-time codemod: rewrites fixed Tailwind text sizes (`text-[13px]`) to the
// scalable `fs-13` utility, which multiplies by --font-scale (Settings →
// Appearance → Text size). At the default scale of 1 the output is identical.
//
// Run from webapp/:  node scripts/codemod-font-scale.mjs [--check]
// --check exits 1 if any `text-[Npx]` is left, without writing.
//
// webapp-online/ is deliberately not in the list: Online keeps fixed sizes for
// its own chrome and never sets --font-scale.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', '../packages/screens-ts/src', '../packages/ui-ts/src'];
const PATTERN = /\btext-\[(\d+(?:\.\d+)?)px\]/g;
const check = process.argv.includes('--check');

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(tsx?|jsx?)$/.test(name)) yield p;
  }
}

let total = 0;
for (const root of ROOTS) {
  for (const file of files(root)) {
    const src = readFileSync(file, 'utf8');
    const hits = src.match(PATTERN)?.length ?? 0;
    if (!hits) continue;
    total += hits;
    if (check) console.error(`${file}: ${hits} fixed text size(s)`);
    else writeFileSync(file, src.replace(PATTERN, 'fs-$1'));
  }
}
if (check && total) process.exit(1);
console.log(check ? 'No fixed text sizes left.' : `Rewrote ${total} fixed text size(s).`);
