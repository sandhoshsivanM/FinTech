/**
 * Stamps a unique id on every build, in two places that must agree:
 *
 *   - `public/build.json` — fetched at runtime by an open tab;
 *   - `.env.production.local` (NEXT_PUBLIC_BUILD_ID) — baked into the bundle.
 *
 * Khazana is a single-page app, and reloading locks the vault, so people keep a
 * tab open for days. Without this, a tab never learns a newer version was
 * deployed and keeps running the old one (it showed removed Pro paywalls after
 * the free-for-everyone deploy). `UpdateBanner` compares the two ids and offers
 * a reload when they differ.
 *
 * Runs as npm `prebuild`, so CI, `npm run deploy` and the Tauri build all get it.
 * Both outputs are git-ignored.
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBAPP = join(dirname(fileURLToPath(import.meta.url)), '..');

let sha = 'nogit';
try {
  sha = execSync('git rev-parse --short HEAD', { cwd: WEBAPP, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();
} catch {
  // Building from a tarball: the timestamp alone still makes the id unique.
}
// The timestamp matters: two deploys of the same commit (say, a re-run after a
// config change) must still count as different builds.
const id = `${sha}-${Date.now().toString(36)}`;

writeFileSync(join(WEBAPP, 'public', 'build.json'), JSON.stringify({ id }) + '\n');
writeFileSync(join(WEBAPP, '.env.production.local'), `NEXT_PUBLIC_BUILD_ID=${id}\n`);
console.log(`build id ${id}`);
