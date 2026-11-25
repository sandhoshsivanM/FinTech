// Asset-type hints: gold, silver and SGB holdings that arrive under a generic
// type. Mirrors packages/khazana_domain/lib/services/asset_hints.dart; both
// suites run test/fixtures/asset_hint_cases.json.
//
// Why this exists: CSV import and Add holding start every row as "Equity / ETF".
// A gold ETF left there counts as equity in Target vs Actual and is taxed as
// equity in the Tax centre. Both are wrong. A hint never changes a holding on
// its own; callers pre-select it for new rows or offer a one-tap Fix.
//
// Deliberately offline and table-driven, like instrumentMaster: no lookup
// leaves the device.
import type { AssetType } from './types';

export type AssetHint = Extract<AssetType, 'gold_etf' | 'silver' | 'sgb'>;

const GOLD_SYMBOLS = new Set([
  'GOLDBEES', 'GOLDIETF', 'SETFGOLD', 'HDFCGOLD', 'AXISGOLD', 'KOTAKGOLD', 'GOLD1',
  'LICMFGOLD', 'BSLGOLDETF', 'QGOLDHALF', 'GOLDCASE', 'IVZINGOLD', 'TATAGOLD',
  'EGOLD', 'GOLDETF', 'GOLDSHARE',
]);

const SILVER_SYMBOLS = new Set([
  'SILVERBEES', 'SILVERIETF', 'SILVER1', 'HDFCSILVER', 'AXISILVER', 'SBISILVER',
  'TATSILV', 'SILVERETF', 'KOTAKSILVE', 'SILVERCASE', 'SILVERADD',
]);

/** Types a hint may override: the defaults import and Add holding start from. */
export const GENERIC_TYPES: ReadonlySet<AssetType> = new Set<AssetType>(['equity_etf', 'equity_mf']);

const FUND_WORD = /\b(etf|bees|fof|fund|fund of funds?)\b/i;

/** "NSE:GOLDBEES", "goldbees.ns" → "GOLDBEES". */
export function normaliseSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  const afterColon = s.includes(':') ? s.slice(s.lastIndexOf(':') + 1) : s;
  return afterColon.replace(/\.(NS|BO|NSE|BSE)$/, '');
}

export function suggestAssetType(symbol: string, title: string): AssetHint | null {
  const sym = normaliseSymbol(symbol);
  if (GOLD_SYMBOLS.has(sym)) return 'gold_etf';
  if (SILVER_SYMBOLS.has(sym)) return 'silver';
  if (/^SGB[A-Z]{3}\d{2}/.test(sym)) return 'sgb';

  const t = title.trim();
  if (/\bsovereign gold bond/i.test(t)) return 'sgb';
  if (!FUND_WORD.test(t)) return null;
  if (/\bgold\b/i.test(t)) return 'gold_etf';
  if (/\bsilver\b/i.test(t)) return 'silver';
  return null;
}

/**
 * The type a holding should probably have, when it is filed under a generic
 * type but looks like gold, silver or an SGB. Null when it looks right, or the
 * user chose a specific type themselves.
 */
export function misfiledAs(type: AssetType, symbol: string, title: string): AssetHint | null {
  if (!GENERIC_TYPES.has(type)) return null;
  const hint = suggestAssetType(symbol, title);
  return hint && hint !== type ? hint : null;
}
