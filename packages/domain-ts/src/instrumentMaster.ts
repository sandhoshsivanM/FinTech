/**
 * Sector / industry / market-cap lookup, loaded from a bundled versioned asset.
 *
 * Mirrors `lib/domain/services/instrument_master.dart` and reads the SAME JSON
 * file, served from `/instrument_master.json`, so both clients classify a
 * holding identically.
 *
 * Deliberately offline: classifying a holding by calling an API would tell that
 * API which stocks you own, which is exactly what this app promises not to do.
 * A bundled table reveals nothing.
 *
 * Coverage is partial by design. An unmatched instrument stays unclassified and
 * appears under "Unclassified" in roll-ups rather than being guessed at.
 */

export type MarketCapBand = 'large' | 'mid' | 'small';

export const MARKET_CAP_LABEL: Record<MarketCapBand, string> = {
  large: 'Large cap',
  mid: 'Mid cap',
  small: 'Small cap',
};

/**
 * The sector names used by the bundled master, offered as suggestions when a
 * holding is classified by hand.
 *
 * A suggestion list, not a closed set: the taxonomy is NSE's equity one, and
 * plenty of what people hold — gold and silver ETFs, sector funds, foreign
 * stock — has no place in it. The field stays free text so those can be
 * grouped sensibly instead of all landing in "Unclassified" together.
 */
export const SECTOR_SUGGESTIONS: readonly string[] = [
  'Automobile and Auto Components',
  'Capital Goods',
  'Chemicals',
  'Commodities',
  'Construction',
  'Construction Materials',
  'Consumer Durables',
  'Consumer Services',
  'Fast Moving Consumer Goods',
  'Financial Services',
  'Healthcare',
  'Information Technology',
  'Media Entertainment & Publication',
  'Metals & Mining',
  'Oil Gas & Consumable Fuels',
  'Power',
  'Realty',
  'Services',
  'Telecommunication',
];

export interface InstrumentClassification {
  symbol?: string;
  isin?: string;
  sector: string;
  industry: string;
  cap?: MarketCapBand;
  benchmark?: string;
}

export interface InstrumentMaster {
  schemaVersion: number;
  bySymbol: Map<string, InstrumentClassification>;
  byIsin: Map<string, InstrumentClassification>;
}

export const EMPTY_MASTER: InstrumentMaster = {
  schemaVersion: 0,
  bySymbol: new Map(),
  byIsin: new Map(),
};

function isCap(v: unknown): v is MarketCapBand {
  return v === 'large' || v === 'mid' || v === 'small';
}

export function parseInstrumentMaster(json: unknown): InstrumentMaster {
  const bySymbol = new Map<string, InstrumentClassification>();
  const byIsin = new Map<string, InstrumentClassification>();

  const root = (json ?? {}) as Record<string, unknown>;
  const list = Array.isArray(root.instruments) ? root.instruments : [];

  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const sector = typeof r.sector === 'string' ? r.sector : undefined;
    const industry = typeof r.industry === 'string' ? r.industry : undefined;
    if (!sector || !industry) continue;

    const record: InstrumentClassification = {
      symbol: typeof r.symbol === 'string' ? r.symbol : undefined,
      isin: typeof r.isin === 'string' ? r.isin : undefined,
      sector,
      industry,
      cap: isCap(r.cap) ? r.cap : undefined,
      benchmark: typeof r.benchmark === 'string' ? r.benchmark : undefined,
    };

    if (record.symbol) bySymbol.set(record.symbol.toUpperCase(), record);
    if (record.isin) byIsin.set(record.isin.toUpperCase(), record);
  }

  return {
    schemaVersion: typeof root.schema_version === 'number' ? root.schema_version : 0,
    bySymbol,
    byIsin,
  };
}

/**
 * Looks up a classification. ISIN wins over symbol — it is unambiguous, whereas
 * a symbol can be reused across exchanges.
 */
export function lookupClassification(
  master: InstrumentMaster,
  opts: { symbol?: string | null; isin?: string | null },
): InstrumentClassification | undefined {
  if (opts.isin) {
    const hit = master.byIsin.get(opts.isin.toUpperCase());
    if (hit) return hit;
  }
  if (opts.symbol) return master.bySymbol.get(opts.symbol.toUpperCase());
  return undefined;
}

/**
 * Classification for a holding the user actually owns.
 *
 * `lookupClassification` answers only "what does the bundled master say about
 * this ticker". A Holding can also carry its own `sector` and `marketCapBand`,
 * documented as overriding that lookup — for ETFs, foreign stock and anything
 * unlisted the master does not cover.
 *
 * Every caller was using the bare master lookup, so those overrides were
 * written by the holdings editor, stored faithfully, and then never read: you
 * could set a sector and watch the allocation still report Unclassified.
 * This is the function screens should use; the raw lookup is for when there is
 * no holding, only a ticker.
 */
export function classifyHolding(
  master: InstrumentMaster,
  h: {
    symbol: string;
    isin?: string | null;
    sector?: string | null;
    marketCapBand?: MarketCapBand | null;
  },
): InstrumentClassification | undefined {
  const base = lookupClassification(master, { symbol: h.symbol, isin: h.isin });
  const sector = h.sector?.trim() || base?.sector;
  const cap = h.marketCapBand ?? base?.cap;

  // Nothing known from either source — the caller must show "Unclassified"
  // rather than an empty-stringed classification that reads as a real bucket.
  if (!sector && !cap) return base;

  return {
    ...base,
    sector: sector ?? '',
    industry: base?.industry ?? '',
    ...(cap ? { cap } : {}),
  };
}

/** Fetches the bundled master. A failure degrades to "no classification". */
export async function loadInstrumentMaster(): Promise<InstrumentMaster> {
  try {
    const res = await fetch('/instrument_master.json');
    if (!res.ok) return EMPTY_MASTER;
    return parseInstrumentMaster(await res.json());
  } catch {
    return EMPTY_MASTER;
  }
}
