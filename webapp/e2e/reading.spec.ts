import { expect, test, type Page } from '@playwright/test';
import { createVaultWithSample, isolate, navigate, settle } from './support';

/**
 * Settings → Text & font. Testers could not read the small figures, so the
 * reader can scale every text size and switch typeface. What a screenshot
 * baseline cannot say: that the choice reaches the text, survives a reload
 * without a small-text flash, and that the largest size still fits a phone.
 */

const SCREENS = [
  '/dashboard/', '/transactions/', '/insurance/', '/safety-net/', '/score/',
  '/investments/', '/analytics/', '/reports/', '/settings/', '/tax/',
];

const fontSizeOf = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

test.beforeEach(async ({ page, baseURL }) => {
  await isolate(page, baseURL!);
});

test('the choice reaches the text and is applied before first paint', async ({ page }) => {
  await createVaultWithSample(page);
  await settle(page);
  // The small label, not the big figure: sizes above 32px stop growing.
  const before = await fontSizeOf(page, 'Groceries · Today');

  await page.getByRole('button', { name: 'Largest' }).click();
  await page.locator('select:has(option[value="atkinson"])').selectOption('atkinson');

  expect(await fontSizeOf(page, 'Groceries · Today')).toBeCloseTo(before * 1.5, 1);
  const family = await page.getByText('₹1,23,456.78').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toMatch(/Atkinson/);

  // A full load with every app script blocked: only the inline no-FOUC script
  // can have set the scale, so the reader never sees small text first.
  await page.route('**/_next/static/chunks/**', (route) => route.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  const early = await page.evaluate(() => document.documentElement.style.getPropertyValue('--font-scale'));
  expect(early).toBe('1.5');
});

test('the largest size never scrolls a phone sideways', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone width only');
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem('khazana-text-size', 'largest');
    localStorage.setItem('khazana-font', 'atkinson');
  });
  await createVaultWithSample(page);
  const overflowing: string[] = [];
  for (const path of SCREENS) {
    await navigate(page, path === '/dashboard/' ? '/settings/' : '/dashboard/');
    await navigate(page, path);
    await settle(page);
    const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (extra > 0) overflowing.push(`${path} +${extra}px`);
  }
  expect(overflowing).toEqual([]);
});
