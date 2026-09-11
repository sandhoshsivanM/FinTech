'use client';
/**
 * The price-refresh action, as one hook.
 *
 * Orchestration only — the decisions live in `yahoo.ts` (what to ask, and of
 * whom) and `refresh.ts` (what a quote may overwrite). This wires them to the
 * vault and reports what happened in terms a person can act on.
 */
import { useCallback, useState } from 'react';
import { useApp } from '@/lib/store';
import { STORE } from '@/lib/types';
import { fetchQuotes, quotesAvailable } from './yahoo';
import { applyQuotes } from './refresh';
import { livePricesEnabled } from './useLivePrices';

export type RefreshOutcome =
  /** Prices were written. `priced` is how many holdings changed hands. */
  | { status: 'refreshed'; priced: number; failed: number }
  /** Nothing to ask about — an empty book, or nothing Yahoo can price. */
  | { status: 'nothing' }
  /** The user has live prices switched off in Settings. */
  | { status: 'disabled' }
  /** A browser build, which cannot reach Yahoo. See `yahoo.ts`. */
  | { status: 'unavailable' }
  /** Asked, and nothing came back. Offline, or Yahoo refusing. */
  | { status: 'failed'; failed: number };

export function usePriceRefresh() {
  const holdings = useApp((s) => s.holdings);
  const putMany = useApp((s) => s.putMany);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (): Promise<RefreshOutcome> => {
    if (!livePricesEnabled()) return { status: 'disabled' };
    if (!quotesAvailable()) return { status: 'unavailable' };
    if (holdings.length === 0) return { status: 'nothing' };

    setBusy(true);
    try {
      const { quotes, failed } = await fetchQuotes(holdings);
      if (quotes.size === 0) {
        // Nothing answered. Distinguishing "asked and got nothing" from "had
        // nothing to ask" matters: the first is a problem worth surfacing, the
        // second is a book of fixed deposits behaving exactly as it should.
        return failed > 0 ? { status: 'failed', failed } : { status: 'nothing' };
      }

      const { updates, priced } = applyQuotes(holdings, quotes, Date.now());
      if (updates.length > 0) {
        // One batch, one reload — `put` per holding would re-read and re-decrypt
        // the whole vault once per position.
        await putMany(updates.map((value) => ({
          type: STORE.holding,
          // Same cast the CSV import path uses (HoldingEditor.tsx): the store's
          // write signature is index-signature-shaped for every record type,
          // which a named interface cannot satisfy structurally.
          value: value as unknown as { id: string } & Record<string, unknown>,
        })));
      }
      return { status: 'refreshed', priced, failed };
    } finally {
      setBusy(false);
    }
  }, [holdings, putMany]);

  return { refresh, busy };
}

/** One line of plain English for a refresh outcome, or null when it is unremarkable. */
export function refreshMessage(o: RefreshOutcome): string | null {
  switch (o.status) {
    case 'refreshed':
      return o.failed > 0
        ? `Updated ${o.priced} ${o.priced === 1 ? 'price' : 'prices'} · ${o.failed} unavailable`
        : `Updated ${o.priced} ${o.priced === 1 ? 'price' : 'prices'}`;
    case 'failed':
      return 'Could not reach Yahoo Finance — prices are unchanged';
    case 'disabled':
    case 'unavailable':
    case 'nothing':
      return null;
  }
}
