import { expect, test, type Locator, type Page } from '@playwright/test';
import { createVaultWithSample, isolate, navigate, settle } from './support';

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
  await isolate(page, baseURL!);
});

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
