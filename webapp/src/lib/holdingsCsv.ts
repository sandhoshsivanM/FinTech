/**
 * Broker CSV import for holdings.
 *
 * Extracted from the old `/investments` screen so the parser can be unit-tested
 * and reused. Column names differ between brokers, so headers are matched by
 * substring against a list of known aliases rather than by exact name.
 *
 * A row is only accepted when symbol, quantity and average cost all parse.
 * Anything else is counted as skipped and reported to the user — silently
 * dropping a position from an import is worse than importing nothing.
 */
import type { AssetType, Holding } from './types';
import { findHeaderRow, headerIndex, num, parseDelimited } from './sheet';

export interface CsvHolding {
  symbol: string;
  exchange: string;
  quantity: string;
  avgCost: string;
  lastPrice: string;
  /**
   * Yesterday's close, so today's move can be a fact rather than a guess.
   * Empty when the export carried neither a previous close nor a day P&L.
   */
  previousClose: string;
  assetType: AssetType;
}

export interface CsvParseResult {
  rows: CsvHolding[];
  skipped: number;
  /** Set when the header row itself is unusable, so the UI can say why. */
  error?: string;
}

const ALIASES = {
  symbol: ['tradingsymbol', 'symbol', 'scrip', 'instrument', 'name'],
  qty: ['qty', 'quantity', 'shares', 'units'],
  avg: ['avg cost', 'avg price', 'average cost', 'average price', 'buy avg', 'buy price', 'purchase price', 'avg', 'average'],
  ltp: ['ltp', 'last price', 'current price', 'market price', 'close price', 'last', 'price'],
  exchange: ['exchange', 'exch', 'market'],
  isin: ['isin'],
  // Two routes to yesterday's close. Brokers that publish it directly are easy;
  // Upstox, Zerodha and Groww instead publish today's P&L, from which the close
  // is exact arithmetic — see below.
  prevClose: ['prev close', 'previous close', 'prev. close', 'prevclose', 'yesterday'],
  dayPnl: ["day's p&l", 'day p&l', 'day pnl', 'day change', "today's p&l", 'day p/l'],
};

// Header matching, cell splitting and number cleaning all live in `sheet.ts`
// now, so the holdings importer and the transaction importer agree on what a
// column name and a number are. Two implementations meant `findHeaderRow`
// could accept a row this file then failed to read.

/**
 * Text entry point. Kept so callers holding a CSV string (and the existing
 * tests) need not know about the grid representation.
 */
export function parseHoldingsCsv(text: string, assetType: AssetType = 'equity_etf'): CsvParseResult {
  return parseHoldingsRows(parseDelimited(text), assetType);
}

/**
 * Grid entry point — what the import screen uses, so an .xlsx and a .csv take
 * exactly the same path once `readSheet` has normalised them.
 *
 * Unlike the original text version this scans for the header row instead of
 * assuming row 0. Broker exports increasingly carry a title line or an account
 * summary above the table, and assuming row 0 rejected those files outright.
 */
export function parseHoldingsRows(grid: string[][], assetType: AssetType = 'equity_etf'): CsvParseResult {
  const lines = grid.filter((r) => r.some((c) => c !== ''));
  if (lines.length < 2) {
    return { rows: [], skipped: 0, error: 'Needs a header row and at least one data row.' };
  }

  const hIdx = findHeaderRow(lines, [ALIASES.symbol, ALIASES.qty, ALIASES.avg]);
  const headers = lines[hIdx === -1 ? 0 : hIdx];
  const body = lines.slice((hIdx === -1 ? 0 : hIdx) + 1);
  const iSym = headerIndex(headers, ALIASES.symbol);
  const iQty = headerIndex(headers, ALIASES.qty);
  const iAvg = headerIndex(headers, ALIASES.avg);
  const iLtp = headerIndex(headers, ALIASES.ltp);
  const iExch = headerIndex(headers, ALIASES.exchange);
  const iPrev = headerIndex(headers, ALIASES.prevClose);
  const iDay = headerIndex(headers, ALIASES.dayPnl);

  const missing = [
    iSym === -1 && 'symbol',
    iQty === -1 && 'quantity',
    iAvg === -1 && 'average cost',
  ].filter(Boolean);
  if (missing.length) {
    return {
      rows: [],
      skipped: body.length,
      error: `Could not find a column for ${missing.join(', ')}. Found: ${headers.filter(Boolean).join(', ')}`,
    };
  }

  const rows: CsvHolding[] = [];
  let skipped = 0;

  for (const cols of body) {
    const symbol = cols[iSym] ?? '';
    const qty = num(cols[iQty] ?? '');
    const avg = num(cols[iAvg] ?? '');

    if (!symbol || !Number.isFinite(qty) || !Number.isFinite(avg) || qty <= 0) {
      skipped++;
      continue;
    }

    const ltp = iLtp !== -1 ? num(cols[iLtp] ?? '') : NaN;
    const exch = iExch !== -1 ? (cols[iExch] ?? '').toUpperCase() : '';

    // Previous close, preferred where the broker states it. Otherwise derived
    // from today's P&L: that column is (ltp - prevClose) * qty by definition,
    // so the close falls straight out of it. Nothing is inferred — if neither
    // column is present the field stays empty and the app says it cannot show
    // a day change rather than inventing one.
    let prev = iPrev !== -1 ? num(cols[iPrev] ?? '') : NaN;
    if (!Number.isFinite(prev) && iDay !== -1 && Number.isFinite(ltp)) {
      const dayPnl = num(cols[iDay] ?? '');
      if (Number.isFinite(dayPnl)) prev = ltp - dayPnl / qty;
    }

    rows.push({
      symbol: symbol.toUpperCase(),
      exchange: exch === 'BSE' ? 'BSE' : 'NSE',
      quantity: String(qty),
      avgCost: String(avg),
      lastPrice: Number.isFinite(ltp) && ltp > 0 ? String(ltp) : '',
      previousClose: Number.isFinite(prev) && prev > 0 ? String(prev) : '',
      assetType,
    });
  }

  return { rows, skipped };
}

/* -------------------------------------------------------------------------- */

export interface ImportPlan {
  /** Records ready to persist. A matched position keeps its existing id. */
  records: Holding[];
  created: number;
  updated: number;
}

/** Match key for an import: the same ticker on the same exchange is the same position. */
function positionKey(symbol: string, exchange: string): string {
  return `${symbol.toUpperCase()}|${exchange.toUpperCase()}`;
}

function byPosition(existing: Holding[]): Map<string, Holding> {
  const byKey = new Map<string, Holding>();
  for (const h of existing) {
    const k = positionKey(h.symbol, h.exchange);
    // First wins: if a past double-import left duplicates, update the one the
    // book would show first rather than picking arbitrarily.
    if (!byKey.has(k)) byKey.set(k, h);
  }
  return byKey;
}

/**
 * How the import splits between new and existing positions.
 *
 * Separate from `planImport` because the preview needs this during render,
 * where minting ids and reading the clock are not allowed.
 */
export function importCounts(rows: CsvHolding[], existing: Holding[]): { created: number; updated: number } {
  const byKey = byPosition(existing);
  let created = 0;
  let updated = 0;
  for (const r of rows) {
    if (byKey.has(positionKey(r.symbol, r.exchange))) updated++; else created++;
  }
  return { created, updated };
}

/**
 * Reconcile parsed rows against the book already on file.
 *
 * Refreshing prices means re-importing, and re-importing used to mint a new id
 * per row — so a second import doubled every position. Matching on
 * symbol + exchange makes the import an update, which is what a broker export
 * actually is.
 *
 * Two rules earn their keep here:
 *
 *  - Everything the CSV cannot know is preserved: purchase date, name, sector,
 *    country, cap band, and the asset type the user already chose. The
 *    "import as" dropdown classifies new rows only; it must not reclassify a
 *    position someone typed by hand.
 *  - Prices move as a set. `lastPrice` and `previousClose` are only ever taken
 *    from the same row, never mixed across imports — a fresh price against a
 *    stale close would compute a day change that never happened. An export
 *    with no price column at all leaves the recorded prices alone.
 */
export function planImport(
  rows: CsvHolding[],
  existing: Holding[],
  ctx: { vaultId: string; newId: () => string; now: number },
): ImportPlan {
  const byKey = byPosition(existing);

  let created = 0;
  let updated = 0;
  const records = rows.map((r) => {
    const prior = byKey.get(positionKey(r.symbol, r.exchange));
    if (prior) updated++; else created++;
    const priced = r.lastPrice !== '';
    return {
      ...(prior ?? {}),
      id: prior?.id ?? ctx.newId(),
      vaultId: prior?.vaultId ?? ctx.vaultId,
      symbol: r.symbol,
      exchange: r.exchange,
      quantity: r.quantity,
      avgCost: r.avgCost,
      lastPrice: priced ? r.lastPrice : (prior?.lastPrice ?? null),
      previousClose: priced ? (r.previousClose || null) : (prior?.previousClose ?? null),
      priceAsOf: priced ? ctx.now : (prior?.priceAsOf ?? null),
      // Records where the figure came from, so the UI can say so and a manual
      // override is never mistaken for a broker's number (§7.1).
      priceSource: priced ? ('import' as const) : (prior?.priceSource ?? null),
      assetType: prior?.assetType ?? r.assetType,
      firstPurchaseDate: prior?.firstPurchaseDate ?? null,
    } satisfies Holding;
  });

  return { records, created, updated };
}
