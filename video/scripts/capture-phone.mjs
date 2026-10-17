/**
 * Phone-sized screens of the real Khazana webapp, for the phone mockups in the ad.
 *
 * Same flow as marketing/capture.mjs (create a throwaway vault, load the
 * deterministic sample data, shoot each route), but at a phone viewport and 3x
 * scale so a phone filling most of a 4K frame stays sharp: 390x844 @3x gives
 * 1170x2532 PNGs.
 *
 * Serves webapp/out itself on :3210 (rebuild it with `cd webapp && npm run
 * build` if the UI changed). Output: public/screens/<theme>/<name>.png
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../../webapp/out');
const SHOTS = resolve(HERE, '../public/screens');
const PORT = 3210;
const BASE = `http://localhost:${PORT}`;
const PIN = '246810'; // throwaway: the vault lives in this headless profile only
const THEMES = ['dark', 'light'];
const ROUTES = [
  ['dashboard', '/dashboard'],
  ['score', '/score'],
  ['safety-net', '/safety-net'],
  ['import', '/import'],
  ['add', '/add'],
];
const VIEW = { width: 390, height: 844 };

const prefs = {
  'khazana-tour-done': '1',
  'khazana-nav-collapsed': '0',
  'khazana-ghost': '0',
  'khazana-demo-market': '1',
};

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '-d', OUT_DIR], { stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i = 0; i < 30; i++) {
  try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  reducedMotion: 'reduce',
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
});
const page = await ctx.newPage();
page.setDefaultNavigationTimeout(120000);
page.on('pageerror', (e) => console.warn('  page error:', e.message));

async function setPrefs(theme) {
  await page.evaluate(([p, t]) => {
    for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v);
    localStorage.setItem('khazana-theme', t);
  }, [prefs, theme]);
}

/** Handles both first-run setup (PIN twice) and a plain unlock. */
async function unlock() {
  const pin = page.getByPlaceholder(/Create PIN|Enter PIN/);
  try { await pin.waitFor({ timeout: 8000 }); } catch { return; } // already open
  await pin.fill(PIN);
  const confirm = page.getByPlaceholder('Confirm PIN');
  if (await confirm.count()) await confirm.fill(PIN);
  await page.getByRole('button', { name: /Create vault|Unlock/ }).click();
  await pin.waitFor({ state: 'detached', timeout: 20000 });
}

async function settle() {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: `
    * { caret-color: transparent !important; }
    :focus, :focus-visible { outline: none !important; box-shadow: none !important; }
    nextjs-portal, [data-nextjs-toast], [data-sonner-toaster] { display: none !important; }
  ` }).catch(() => {});
  await page.evaluate(() => document.activeElement?.blur?.());
}

/** Client-side navigation keeps the in-memory vault key; fall back to goto + unlock. */
async function go(path) {
  const pushed = await page.evaluate((p) => {
    const r = window.next?.router;
    if (r?.push) { r.push(p); return true; }
    return false;
  }, path);
  if (pushed) {
    await page.waitForURL((u) => u.pathname.startsWith(path), { timeout: 20000 });
  } else {
    await page.goto(BASE + path);
    await unlock();
  }
}

await page.goto(BASE + '/dashboard');
await setPrefs('dark');
await page.reload();
await unlock();
await go('/settings');
await page.getByRole('button', { name: 'Load sample data' }).click();
await page.getByText('Sample data loaded', { exact: false }).waitFor({ timeout: 90000 });
console.log('sample data loaded');

for (const theme of THEMES) {
  await setPrefs(theme);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.reload();
  await unlock();
  const dir = `${SHOTS}/${theme}`;
  await mkdir(dir, { recursive: true });
  for (const [name, path] of ROUTES) {
    await go(path);
    await settle();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${dir}/${name}.png` });
    console.log(`  ${theme} ${name}`);
  }
}

await browser.close();
server.kill();
