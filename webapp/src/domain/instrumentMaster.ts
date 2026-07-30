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
