import { describe, test, expect } from 'vitest';
import { newestPriceAsOf, priceAgeLabel } from './freshness';
import type { Holding } from '@/lib/types';

const h = (over: Partial<Holding>): Holding => ({
  id: 'h1', vaultId: 'v1', symbol: 'INFY', exchange: 'NSE',
  quantity: '10', avgCost: '1000', assetType: 'equity_etf', lastPrice: '1100', ...over,
});

const NOW = new Date('2026-09-11T09:00:00+05:30').getTime();
const hoursAgo = (n: number) => NOW - n * 60 * 60_000;

describe('newestPriceAsOf', () => {
  test('returns the newest stamp in the book', () => {
    expect(newestPriceAsOf([
      h({ id: 'a', priceAsOf: hoursAgo(50) }),
      h({ id: 'b', priceAsOf: hoursAgo(2) }),
      h({ id: 'c', priceAsOf: hoursAgo(30) }),
    ])).toBe(hoursAgo(2));
  });

  // A stamp left behind on a position whose price was cleared would otherwise
  // date the whole book to a price that is no longer there.
  test('ignores a stamp on a holding carrying no price', () => {
    expect(newestPriceAsOf([
      h({ id: 'a', lastPrice: '1100', priceAsOf: hoursAgo(50) }),
      h({ id: 'b', lastPrice: null, priceAsOf: hoursAgo(1) }),
    ])).toBe(hoursAgo(50));
  });

  test('returns null for an empty book or unstamped prices', () => {
    expect(newestPriceAsOf([])).toBeNull();
    expect(newestPriceAsOf([h({ priceAsOf: null })])).toBeNull();
    expect(newestPriceAsOf([h({ priceAsOf: undefined })])).toBeNull();
  });
});

describe('priceAgeLabel', () => {
  test('names the age in coarse bands', () => {
    expect(priceAgeLabel([h({ priceAsOf: hoursAgo(0.2) })], NOW)).toBe('Priced just now');
    expect(priceAgeLabel([h({ priceAsOf: hoursAgo(5) })], NOW)).toBe('Priced today');
    expect(priceAgeLabel([h({ priceAsOf: hoursAgo(30) })], NOW)).toBe('Priced yesterday');
    expect(priceAgeLabel([h({ priceAsOf: hoursAgo(24 * 7) })], NOW)).toMatch(/^Priced /);
  });

  // Saying nothing is correct; implying "today" is the failure this prevents.
  test('says nothing when nothing can be said', () => {
    expect(priceAgeLabel([], NOW)).toBeNull();
    expect(priceAgeLabel([h({ priceAsOf: null })], NOW)).toBeNull();
  });

  // A restored backup from a machine whose clock ran ahead must not render a
  // price as dated in the future.
  test('treats a future stamp as now', () => {
    expect(priceAgeLabel([h({ priceAsOf: NOW + 86_400_000 })], NOW)).toBe('Priced just now');
  });
});
