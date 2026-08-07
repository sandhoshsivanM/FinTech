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
import type { AssetType } from './types';

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

function headerIndex(headers: string[], patterns: string[]): number {
  for (const p of patterns) {
    const idx = headers.findIndex((h) => h.toLowerCase().includes(p));
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Splits one CSV line, honouring double-quoted fields that contain commas. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out.map((c) => c.replace(/^["']|["']$/g, '').trim());
}

/** Strips thousands separators and currency symbols before parsing a number. */
function num(raw: string): number {
  return parseFloat(String(raw).replace(/[₹$,\s]/g, ''));
}

export function parseHoldingsCsv(text: string, assetType: AssetType = 'equity_etf'): CsvParseResult {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { rows: [], skipped: 0, error: 'Needs a header row and at least one data row.' };
  }

  const headers = splitLine(lines[0]);
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
      skipped: lines.length - 1,
      error: `Could not find a column for ${missing.join(', ')}. Found: ${headers.join(', ')}`,
    };
  }

  const rows: CsvHolding[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
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
