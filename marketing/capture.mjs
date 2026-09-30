/**
 * Stage 1 — drive the real Khazana webapp and save raw screens.
 *
 * Serves nothing itself — run.sh serves the static build (webapp/out) on :3200
 * and then calls this. BASE_URL overrides the address. Pro screens are
 * unlocked with a pool licence key (LICENSE_KEY_FILE, last line).
 * Output: screens/<theme>/<name>.png (viewport) and <name>-tall.png.
 */
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';

const BASE = process.env.BASE_URL ?? 'http://localhost:3200';
const PIN = '246810'; // throwaway — the vault lives in this headless profile only
const THEMES = ['light', 'dark'];
const ROUTES = [
  ['dashboard', '/dashboard'],
  ['portfolio', '/investments'],
  ['score', '/score'],
  ['safety-net', '/safety-net'],
  ['analytics', '/analytics'],
  ['forecast', '/forecast'],
  ['holdings', '/holdings'],
  ['transactions', '/transactions'],
  ['budget', '/budget'],
  ['import', '/import'],
  ['add', '/add'],
];
const VIEW = { width: 1440, height: 900 };
const TALL = 1800;

// Pro screens: one licence key from the pool, verified offline by the app.
// Read at runtime only — never written to the repo, logs or output.
const keyFile = process.env.LICENSE_KEY_FILE ?? `${homedir()}/khazana-keys-pool.txt`;
const licence = (await readFile(keyFile, 'utf8').catch(() => '')).trim().split('\n').pop()?.trim();
if (!licence) console.warn('no licence key found — Pro screens will show the paywall');

const prefs = {
  'khazana-tour-done': '1',
  'khazana-accent': 'emerald',
  'khazana-nav-collapsed': '0',
  'khazana-ghost': '0',
  'khazana-demo-market': '1',
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
  colorScheme: 'light',
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
  if (licence) await page.evaluate((k) => localStorage.setItem('khazana-license-v1', k), licence);
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
  // Capture-only artifacts: carets, focus rings, toasts, dev overlay.
  await page.addStyleTag({ content: `
    * { caret-color: transparent !important; }
    :focus, :focus-visible { outline: none !important; box-shadow: none !important; }
    nextjs-portal, [data-nextjs-toast], [data-sonner-toaster] { display: none !important; }
  ` }).catch(() => {});
  await page.evaluate(() => (document.activeElement)?.blur?.());
  await page.mouse.move(0, VIEW.height - 1);
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

// ── First run: create vault and load the deterministic sample ─────────────
await page.goto(BASE + '/dashboard');
// The vault-setup screen exists only before the first vault, so shoot it in
// both themes now (PIN typed, not submitted) for the "How it works" steps.
for (const theme of THEMES) {
  await setPrefs(theme);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.reload();
  const pin = page.getByPlaceholder('Create PIN');
  await pin.waitFor({ timeout: 20000 });
  await pin.fill(PIN);
  await page.getByPlaceholder('Confirm PIN').fill(PIN);
  await settle();
  await mkdir(`screens/${theme}`, { recursive: true });
  await page.screenshot({ path: `screens/${theme}/vault.png` });
  console.log(`  ${theme} vault`);
}
await setPrefs('light');
await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
await page.reload();
await unlock();
// Settings → Data → Load sample data (the dashboard starter card is not shown
// once the default account exists, so go straight to Settings).
await go('/settings');
await page.getByRole('button', { name: 'Load sample data' }).click();
await page.getByText('Sample data loaded', { exact: false }).waitFor({ timeout: 90000 });
console.log('sample data loaded');

for (const theme of THEMES) {
  await setPrefs(theme);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.reload();
  await unlock();
  const dir = `screens/${theme}`;
  await mkdir(dir, { recursive: true });

  for (const [name, path] of ROUTES) {
    await go(path);
    await settle();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${dir}/${name}.png` });

    await page.setViewportSize({ width: VIEW.width, height: TALL });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/${name}-tall.png` });
    await page.setViewportSize(VIEW);
    console.log(`  ${theme} ${name}`);
  }
}

await browser.close();
