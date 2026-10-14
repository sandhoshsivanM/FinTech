import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Visual regression over the app's key screens, with the demo vault loaded.
 *
 * Today's bugs that this exists for were all visible and none were caught by
 * a unit test: page styles drifting apart, a gradient chip losing its fill to
 * a duplicate SVG id, a translucent hover revealing a layer underneath, a card
 * footer not clipped. A screenshot compare catches that whole class.
 *
 * Determinism:
 *   - The wall clock is frozen (`setFixedTime`), so the sample vault — whose
 *     dates are all offsets from `Date.now()` and whose "randomness" is a
 *     string-seeded hash (src/lib/sampleData.ts) — is identical every run, and
 *     so are "Due in 12d", the market-session pill and month headers. Timers
 *     still run, so the app behaves normally.
 *   - Timezone, locale, colour scheme and reduced motion are pinned in
 *     playwright.config.ts.
 *   - Every request off the local static server is aborted. The app is
 *     offline-first; a live quote feed answering would change the numbers.
 *   - The first-run tour is marked done before the app boots.
 *
 * Baselines: see playwright.config.ts and the CI "Visual regression" job.
 */

/**
 * Sunday 15 March 2026, 11:00 IST. A Sunday so the NSE session pill reads
 * "Closed" regardless of the time, and mid-month so "this month" has data on
 * both sides of today.
 */
const FROZEN_NOW = new Date('2026-03-15T11:00:00+05:30');
const TEST_PIN = '246810';

/** Route → regions that are still dynamic under a frozen clock (none today). */
const ROUTES: { name: string; path: string; mask?: (page: Page) => Locator[] }[] = [
  { name: 'dashboard', path: '/dashboard/' },
  { name: 'transactions', path: '/transactions/' },
  { name: 'insurance', path: '/insurance/' },
  { name: 'safety-net', path: '/safety-net/' },
  { name: 'score', path: '/score/' },
  { name: 'investments', path: '/investments/' },
  { name: 'analytics', path: '/analytics/' },
  { name: 'reports', path: '/reports/' },
  { name: 'settings', path: '/settings/' },
  { name: 'tax', path: '/tax/' },
];

test.beforeEach(async ({ page, baseURL }) => {
  await page.clock.setFixedTime(FROZEN_NOW);
  await page.addInitScript(() => {
    // Record ids come from crypto.randomUUID(), and lists break same-date ties
    // by id, so rows sharing a date reorder between runs. A counter makes the
    // ids — and therefore the order — the same every time. Key material still
    // uses getRandomValues, which never reaches the screen.
    let n = 0;
    const seq = () => {
      n += 1;
      return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`;
    };
    try {
      Object.defineProperty(crypto, 'randomUUID', { value: seq, configurable: true });
    } catch {
      /* non-configurable in this engine: ties may reorder, and the diff will say so */
    }
    try {
      localStorage.setItem('khazana-tour-done', '1');
    } catch {
      /* storage blocked: the tour then needs dismissing by hand, and the shot will show it */
    }
  });
  const origin = new URL(baseURL!).origin;
  await page.route(
    (url) => url.origin !== origin,
    (route) => route.abort('blockedbyclient'),
  );
});

/**
 * Client-side navigation. A full page load would lock the vault again (the key
 * lives only in memory), so routes are reached the way a user reaches them:
 * through the app router.
 */
async function navigate(page: Page, path: string) {
  await page.evaluate((p) => {
    const w = window as unknown as { next?: { router?: { push(href: string): void } } };
    if (!w.next?.router) throw new Error('Next app router not exposed on window.next');
    w.next.router.push(p);
  }, path);
  await page.waitForURL((u) => u.pathname === path);
}

/** Wait until the page has stopped changing for reasons a screenshot cares about. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Two frames: one for any state set in the last effect, one to paint it.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function createVaultWithSample(page: Page) {
  await page.goto('/dashboard/');
  await page.getByPlaceholder('Create PIN').fill(TEST_PIN);
  await page.getByPlaceholder('Confirm PIN').fill(TEST_PIN);
  await page.getByRole('button', { name: 'Create vault' }).click();
  await page.getByPlaceholder('Confirm PIN').waitFor({ state: 'detached' });

  // The dashboard's own "Load sample data" card only shows on an empty vault,
  // and a new vault starts with a Cash account, so seed from Settings.
  await navigate(page, '/settings/');
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await expect(page.getByText('Sample data loaded')).toBeVisible({ timeout: 30_000 });
}

for (const route of ROUTES) {
  test(route.name, async ({ page }) => {
    await createVaultWithSample(page);
    // Land somewhere else first so the Settings success note never leaks into
    // the settings shot, and every route is a fresh mount.
    await navigate(page, route.path === '/dashboard/' ? '/settings/' : '/dashboard/');
    await navigate(page, route.path);
    await settle(page);

    await expect(page).toHaveScreenshot(`${route.name}.png`, {
      fullPage: true,
      mask: route.mask?.(page) ?? [],
    });
  });
}
