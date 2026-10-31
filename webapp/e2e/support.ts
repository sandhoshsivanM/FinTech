import { expect, type Page } from '@playwright/test';

// Setup shared by the e2e specs. testMatch only picks up *.spec.ts, so this
// file is never run as a test on its own.

export const TEST_PIN = '246810';

/**
 * Keeps a run offline and quiet: every request off the local static server is
 * aborted (the app is offline-first; a live quote feed answering would change
 * the numbers), UUIDs are sequential, and the first-run tour is marked done.
 */
export async function isolate(page: Page, baseURL: string) {
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
  const origin = new URL(baseURL).origin;
  await page.route(
    (url) => url.origin !== origin,
    (route) => route.abort('blockedbyclient'),
  );
}

/**
 * Client-side navigation. A full page load would lock the vault again (the key
 * lives only in memory), so routes are reached the way a user reaches them:
 * through the app router.
 */
export async function navigate(page: Page, path: string) {
  await page.evaluate((p) => {
    const w = window as unknown as { next?: { router?: { push(href: string): void } } };
    if (!w.next?.router) throw new Error('Next app router not exposed on window.next');
    w.next.router.push(p);
  }, path);
  await page.waitForURL((u) => u.pathname === path);
}

/** Wait until the page has stopped changing for reasons a screenshot cares about. */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Two frames: one for any state set in the last effect, one to paint it.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.evaluate(() => window.scrollTo(0, 0));
}

export async function createVaultWithSample(page: Page) {
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
