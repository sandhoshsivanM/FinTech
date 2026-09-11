import { describe, test, expect } from 'vitest';
import { parseYahooChart, yahooTicker } from './yahoo';
import type { Holding } from '@/lib/types';

const h = (over: Partial<Holding>): Holding => ({
  id: 'h1', vaultId: 'v1', symbol: 'INFY', exchange: 'NSE',
  quantity: '10', avgCost: '1000', assetType: 'equity_etf', ...over,
});

/** The shape Yahoo actually returns, trimmed to the fields we read. */
const chart = (meta: Record<string, unknown>) => ({ chart: { result: [{ meta }], error: null } });

describe('yahooTicker', () => {
  test('suffixes Indian listings by exchange', () => {
    expect(yahooTicker(h({ symbol: 'INFY', exchange: 'NSE' }))).toBe('INFY.NS');
    expect(yahooTicker(h({ symbol: 'INFY', exchange: 'BSE' }))).toBe('INFY.BO');
  });

  // A bare `INFY` resolves to a different security on a different exchange.
  // That does not fail loudly — it prices the wrong instrument — so the suffix
  // is not cosmetic.
  test('leaves a ticker that already carries a suffix alone', () => {
    expect(yahooTicker(h({ symbol: 'TCS.NS', exchange: 'NSE' }))).toBe('TCS.NS');
    expect(yahooTicker(h({ symbol: 'tcs.ns', exchange: 'NSE' }))).toBe('TCS.NS');
  });

  test('passes foreign equity through bare', () => {
    expect(yahooTicker(h({ symbol: 'QQQ', assetType: 'foreign_equity' }))).toBe('QQQ');
  });

  // Mutual funds, FDs, PPF, real estate and the rest have no exchange ticker.
  // Asking Yahoo for one spends a request to be told nothing.
  test('returns null for anything Yahoo cannot price by ticker', () => {
    for (const assetType of ['equity_mf', 'debt_mf', 'fd', 'ppf_epf', 'real_estate', 'cash'] as const) {
      expect(yahooTicker(h({ assetType }))).toBeNull();
    }
  });

  test('returns null for a blank symbol', () => {
    expect(yahooTicker(h({ symbol: '   ' }))).toBeNull();
  });
});

describe('parseYahooChart', () => {
  // A real response, trimmed only of the arrays we never read. Captured from
  // query1.finance.yahoo.com for INFY.NS. Hand-built fixtures test that the
  // parser matches our idea of the shape; this one tests that our idea matches
  // Yahoo's — which is the half that breaks without warning.
  test('reads a genuine Yahoo payload', () => {
    const real = {
      chart: {
        result: [{
          meta: {
            currency: 'INR', symbol: 'INFY.NS', exchangeName: 'NSI', instrumentType: 'EQUITY',
            regularMarketTime: 1789099098, gmtoffset: 19800, timezone: 'IST',
            regularMarketPrice: 1039.0, regularMarketChangePercent: 0.241,
            fiftyTwoWeekHigh: 1728.0, fiftyTwoWeekLow: 982.4,
            regularMarketDayHigh: 1047.3, regularMarketDayLow: 1029.7,
            longName: 'Infosys Limited', chartPreviousClose: 1036.5, priceHint: 2,
            dataGranularity: '1d', range: '1d',
          },
          timestamp: [1789099098],
        }],
        error: null,
      },
    };
    expect(parseYahooChart(real)).toEqual({ price: '1039', previousClose: '1036.5' });
  });

  test('reads the price and the previous close', () => {
    expect(parseYahooChart(chart({ regularMarketPrice: 1168.7, chartPreviousClose: 1180.2 })))
      .toEqual({ price: '1168.7', previousClose: '1180.2' });
  });

  test('falls back to previousClose when chartPreviousClose is absent', () => {
    expect(parseYahooChart(chart({ regularMarketPrice: 100, previousClose: 98.5 })))
      .toEqual({ price: '100', previousClose: '98.5' });
  });

  test('a price with no previous close still yields a quote', () => {
    expect(parseYahooChart(chart({ regularMarketPrice: 100 })))
      .toEqual({ price: '100', previousClose: null });
  });

  test('accepts a numeric string', () => {
    expect(parseYahooChart(chart({ regularMarketPrice: '84.96' })))
      .toEqual({ price: '84.96', previousClose: null });
  });

  // Zero is a real figure and must not be confused with "no figure" — but a
  // non-finite one is not, and storing it would value the position at nothing
  // while looking like a genuine quote.
  test('keeps a zero price but rejects non-finite ones', () => {
    expect(parseYahooChart(chart({ regularMarketPrice: 0 }))?.price).toBe('0');
    expect(parseYahooChart(chart({ regularMarketPrice: Number.NaN }))).toBeNull();
    expect(parseYahooChart(chart({ regularMarketPrice: 'not a number' }))).toBeNull();
  });

  // One delisted or mistyped ticker must not fail the rest of the book, so
  // every malformed shape returns null rather than throwing.
  test('returns null for every malformed shape instead of throwing', () => {
    const bad: unknown[] = [
      null, undefined, 42, 'text', {}, { chart: null }, { chart: {} },
      { chart: { result: [] } }, { chart: { result: null } },
      { chart: { result: [{}] } }, { chart: { result: [{ meta: null }] } },
      chart({}), chart({ regularMarketPrice: null }),
      { chart: { result: [], error: { code: 'Not Found' } } },
    ];
    for (const b of bad) {
      expect(() => parseYahooChart(b)).not.toThrow();
      expect(parseYahooChart(b)).toBeNull();
    }
  });
});
