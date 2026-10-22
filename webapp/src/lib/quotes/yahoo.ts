/**
 * Live quotes from Yahoo Finance.
 *
 * ── Scope, and why it is this narrow ───────────────────────────────────────
 *
 * This is the ONLY module in the web/desktop client that talks to the network,
 * and it reaches exactly one upstream host. That is enforced in three places:
 *
 *   1. Here — the endpoints are constants and nothing takes a URL argument.
 *   2. `src-tauri/capabilities/default.json` — the desktop HTTP permission is
 *      scoped to `https://query1.finance.yahoo.com/*`, so a request anywhere
 *      else is refused by Tauri itself rather than by our good intentions.
 *   3. The web CSP is `connect-src 'self'` (netlify.toml): the browser build can
 *      reach its own origin and nothing else.
 *
 * The request carries a ticker symbol and nothing else: no vault id, no
 * quantity, no holding value, no identifier of any kind. Yahoo learns which
 * instruments are being looked at, never how much of them anyone owns. This is
 * the behaviour the privacy page describes.
 *
 * ── Two routes to the same endpoint ────────────────────────────────────────
 *
 * Yahoo's chart endpoint sends no CORS headers, so a browser `fetch` to it
 * fails before it leaves the page.
 *
 * Desktop: the Tauri HTTP plugin performs the request in Rust, outside the
 * webview, where the same-origin policy does not apply.
 *
 * Web: the request goes to `/.netlify/functions/quote` on Khazana's own origin,
 * a stateless relay (`proxy.ts`) that forwards the ticker to Yahoo and returns
 * the answer untouched. It is not a Next route handler — `output: 'export'`
 * cannot serve one — but a Netlify Function deployed beside the static files.
 * It holds no data and keeps no log, so "no server holds your data" stays true.
 */
import { isTauri } from '@/lib/notify';
import type { AssetType, Holding } from '@khazana/domain/types';

import { CHART_ENDPOINT } from './proxy';

/** The web build's same-origin relay. See `proxy.ts`. */
export const PROXY_ENDPOINT = '/.netlify/functions/quote';

/**
 * Asset types Yahoo can price by ticker.
 *
 * Indian mutual funds are absent on purpose: they have no exchange ticker, so
 * asking Yahoo for one spends a request to be told nothing. The Flutter client
 * routes those to AMFI, which this client does not implement — an unpriceable
 * holding simply keeps the price it already had.
 */
const TICKERED: ReadonlySet<AssetType> = new Set<AssetType>([
  'equity_etf', 'gold_etf', 'foreign_equity',
]);

/** One instrument's quote, as strings — money never leaves Decimal form. */
export interface Quote {
  /** Latest traded price. */
  price: string;
  /**
   * The prior session's close, when Yahoo reports one.
   *
   * Worth taking even though nothing asked for it: the day-change column is
   * blank for any holding without a previous close, and recording a real one
   * here is what lets `domain/dayChange.ts` state a day move as fact instead of
   * falling back to the synthesised feed.
   */
  previousClose: string | null;
}

/**
 * The Yahoo ticker for a holding, or null when it has none.
 *
 * Indian listings need the exchange suffix — `INFY` alone resolves to a
 * different instrument on a different exchange, so a missing suffix does not
 * fail loudly, it prices the wrong security. Foreign equity is passed through
 * bare, which is what Yahoo expects for US listings.
 */
export function yahooTicker(h: Pick<Holding, 'symbol' | 'exchange' | 'assetType'>): string | null {
  if (!TICKERED.has(h.assetType)) return null;
  const symbol = h.symbol.trim().toUpperCase();
  if (!symbol) return null;
  // Already carries a suffix (the user typed `TCS.NS`, or it came from a broker
  // file that writes them). Left alone — appending a second one makes it
  // unresolvable.
  if (symbol.includes('.')) return symbol;
  if (h.assetType === 'foreign_equity') return symbol;
  return h.exchange === 'BSE' ? `${symbol}.BO` : `${symbol}.NS`;
}

/**
 * Reads a quote out of a Yahoo chart response.
 *
 * Split from the request so it can be tested against real payloads without a
 * network, and so a shape change upstream fails here — in one place, with a
 * name — rather than as `undefined` propagating into a stored price.
 *
 * Returns null rather than throwing: one delisted or mistyped ticker in a book
 * of twenty must not fail the other nineteen.
 */
export function parseYahooChart(body: unknown): Quote | null {
  if (typeof body !== 'object' || body === null) return null;
  const chart = (body as { chart?: unknown }).chart;
  if (typeof chart !== 'object' || chart === null) return null;

  const result = (chart as { result?: unknown }).result;
  if (!Array.isArray(result) || result.length === 0) return null;

  const meta = (result[0] as { meta?: unknown })?.meta;
  if (typeof meta !== 'object' || meta === null) return null;

  const price = numeric((meta as Record<string, unknown>).regularMarketPrice);
  if (price === null) return null;

  return { price, previousClose: numeric((meta as Record<string, unknown>).chartPreviousClose)
    ?? numeric((meta as Record<string, unknown>).previousClose) };
}

/**
 * A finite number as a Decimal string, or null.
 *
 * Yahoo sends JSON numbers, and a few fields arrive as strings. Both are
 * accepted; NaN, Infinity, null and absent are all "no figure", which must stay
 * distinguishable from zero — a stored `"0"` price would value the position at
 * nothing and read as a real quote.
 */
function numeric(v: unknown): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : null;
  }
  return null;
}

/**
 * Whether this build can fetch quotes at all: in the desktop app, and in a
 * browser page (through the relay). False only during prerender, where there
 * is no window to fetch from.
 */
export function quotesAvailable(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Fetches one ticker. Resolves to null on any failure — HTTP, parse or network.
 *
 * Deliberately quiet about *why*: the caller reports a count of what could not
 * be priced, and a per-symbol error string would be a Yahoo implementation
 * detail shown to someone who can do nothing with it.
 */
async function fetchOne(ticker: string): Promise<Quote | null> {
  try {
    let res: Response;
    if (isTauri()) {
      // Lazily imported so the browser bundle never carries the Tauri HTTP
      // client it has no use for.
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
      res = await tauriFetch(`${CHART_ENDPOINT}${encodeURIComponent(ticker)}?interval=1d&range=1d`, { method: 'GET' });
    } else {
      res = await fetch(`${PROXY_ENDPOINT}?t=${encodeURIComponent(ticker)}`);
    }
    if (!res.ok) return null;
    return parseYahooChart(await res.json());
  } catch {
    return null;
  }
}

export interface RefreshResult {
  /** Ticker → quote, for everything that came back. */
  quotes: Map<string, Quote>;
  /** Holdings that have no Yahoo ticker, so were never asked about. */
  skipped: number;
  /** Tickers that were asked about and did not answer. */
  failed: number;
}

/**
 * Fetches quotes for a book of holdings.
 *
 * Sequential, not `Promise.all`. Yahoo's unofficial endpoint rate-limits a
 * burst from one address, and a portfolio of thirty firing at once gets a
 * portion of them refused — which reads to the user as "refresh is flaky"
 * rather than as "we asked too fast". One at a time is slower and complete.
 */
export async function fetchQuotes(holdings: Holding[]): Promise<RefreshResult> {
  const quotes = new Map<string, Quote>();
  let skipped = 0;
  let failed = 0;

  if (!quotesAvailable()) {
    return { quotes, skipped: holdings.length, failed: 0 };
  }

  // De-duplicated: the same ticker held in two profiles or two lots is one
  // request, not two.
  const tickers = new Set<string>();
  for (const h of holdings) {
    const t = yahooTicker(h);
    if (t === null) skipped += 1;
    else tickers.add(t);
  }

  for (const ticker of tickers) {
    const q = await fetchOne(ticker);
    if (q) quotes.set(ticker, q);
    else failed += 1;
  }

  return { quotes, skipped, failed };
}
