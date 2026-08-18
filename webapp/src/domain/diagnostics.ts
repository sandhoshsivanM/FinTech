/**
 * Self-checks over the vault.
 *
 * When a screen died there was nothing to look at: no error surface, no record
 * counts, no way to tell a corrupt record from an empty one. Every problem hit
 * during a day of real use — invisible records under a foreign profile id, a
 * money value carrying a stray space, a holding whose sector override nothing
 * read — was findable in the data and reported by nothing.
 *
 * Each check answers one question a user could otherwise only answer by
 * reading source. Severity is honest: `error` means a number on screen is
 * wrong, `warn` means something is missing that limits a feature, `ok` means
 * checked and fine. Nothing here writes; a diagnostic that repairs silently is
 * how you lose the evidence.
 */
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type {
  Account, Category, Dividend, FxRate, Holding, HoldingLot, Posting, Transfer, Txn,
} from '@/lib/types';
import { reconcileLots } from './lots';
import { hasApproximateFx } from './portfolio';
import { FX_STALE_DAYS, isRateStale, rateAsOf } from './currency';
import { balanceSheet } from './statements';

export type CheckLevel = 'ok' | 'warn' | 'error';

export interface Check {
  id: string;
  label: string;
  level: CheckLevel;
  /** One line the user can act on. */
  detail: string;
  /** Ids of the offending records, for the "show me" affordance. */
  offenders?: string[];
}

export interface DiagnosticsInput {
  /** Optional: a vault with no lots is normal, not a fault. */
  lots?: HoldingLot[];
  /** Records that would not decrypt on the last load. Optional; empty is normal. */
  unreadableRecords?: { type: string; id: string }[];
  /** Ids of stored receipts. Omit to skip the receipt checks entirely. */
  attachmentIds?: string[];
  /** Recorded exchange rates, for the currency-freshness checks. */
  fxRates?: FxRate[];
  /** Clock, injected so the staleness checks are testable. */
  now?: number;
  txns: Txn[];
  transfers: Transfer[];
  postings: Posting[];
  accounts: Account[];
  categories: Category[];
  holdings: Holding[];
  dividends: Dividend[];
}

/** Is this string safe to hand to Decimal? Mirrors what `D` has to recover from. */
function isCleanMoney(v: string | null | undefined): boolean {
  if (v == null || v === '') return false;
  try {
    // eslint-disable-next-line no-new
    new Decimal(v);
    return true;
  } catch {
    return false;
  }
}

export function runDiagnostics(input: DiagnosticsInput): Check[] {
  const { txns, transfers, postings, accounts, categories, holdings, dividends } = input;
  const lots = input.lots ?? [];
  const unreadable = input.unreadableRecords ?? [];
  const attachmentIds = input.attachmentIds;
  const fxRates = input.fxRates ?? [];
  const now = input.now ?? Date.now();
  const checks: Check[] = [];

  /* ---- Storage readability --------------------------------------------- */

  // A record that will not decrypt is skipped on read, so it is missing from
  // every screen *and* from the next backup export. Silence here means the loss
  // reaches the user's only copy without anyone noticing.
  checks.push(unreadable.length === 0
    ? { id: 'record-readable', label: 'Record readability', level: 'ok', detail: 'Every record in the vault decrypts.' }
    : {
        id: 'record-readable', label: 'Record readability', level: 'error',
        detail: `${unreadable.length} record${unreadable.length === 1 ? '' : 's'} cannot be decrypted. They are missing from every screen and will not be included in a backup — restore from your most recent good backup before exporting again.`,
        offenders: unreadable.map((r) => `${r.type}:${r.id}`).slice(0, 20),
      });

  /* ---- Ledger integrity ------------------------------------------------ */

  // Every entry's postings must sum to zero. If they don't, account balances
  // and net worth disagree with the transaction list and neither is trustworthy.
  const byEntry = new Map<string, Decimal>();
  for (const p of postings) {
    byEntry.set(p.entryId, (byEntry.get(p.entryId) ?? ZERO).plus(D(p.amount)));
  }
  const unbalanced = [...byEntry.entries()].filter(([, sum]) => !sum.isZero()).map(([id]) => id);
  checks.push(unbalanced.length === 0
    ? { id: 'ledger-balanced', label: 'Double-entry balance', level: 'ok', detail: `All ${byEntry.size} posted entries balance to zero.` }
    : {
        id: 'ledger-balanced', label: 'Double-entry balance', level: 'error',
        detail: `${unbalanced.length} entr${unbalanced.length === 1 ? 'y does' : 'ies do'} not balance. Account balances cannot be trusted until this is resolved.`,
        offenders: unbalanced.slice(0, 20),
      });

  // An entry with no postings is invisible to every per-account figure.
  const posted = new Set(postings.map((p) => p.entryId));
  const unposted = [...txns, ...transfers].filter((e) => !posted.has(e.id)).map((e) => e.id);
  checks.push(unposted.length === 0
    ? { id: 'ledger-coverage', label: 'Ledger coverage', level: 'ok', detail: `Every one of the ${txns.length + transfers.length} entries has postings.` }
    : {
        id: 'ledger-coverage', label: 'Ledger coverage', level: 'warn',
        detail: `${unposted.length} entr${unposted.length === 1 ? 'y has' : 'ies have'} no postings, so they are missing from account balances. Reopening the app repairs these automatically.`,
        offenders: unposted.slice(0, 20),
      });

  // A posting pointing at a deleted account silently drops out of every total.
  const acctIds = new Set(accounts.map((a) => a.id));
  const orphanPostings = postings.filter((p) => !acctIds.has(p.accountId)).map((p) => p.id);
  checks.push(orphanPostings.length === 0
    ? { id: 'posting-accounts', label: 'Posting accounts', level: 'ok', detail: 'Every posting points at a live account.' }
    : {
        id: 'posting-accounts', label: 'Posting accounts', level: 'error',
        detail: `${orphanPostings.length} posting${orphanPostings.length === 1 ? '' : 's'} reference an account that no longer exists, so their value is missing from every balance.`,
        offenders: orphanPostings.slice(0, 20),
      });

  // Assets + liabilities + equity, with opening capital and retained earnings
  // derived, is identically zero for a well-formed ledger. This is where that
  // check belongs: the Balance Sheet is a financial statement and a reader
  // there wants a total, not an internal consistency report (§3.4).
  const bs = balanceSheet(accounts, postings);
  checks.push(bs.balanced
    ? { id: 'balance-sheet', label: 'Balance sheet', level: 'ok', detail: 'Assets equal liabilities plus equity.' }
    : {
        id: 'balance-sheet', label: 'Balance sheet', level: 'error',
        detail: bs.unclassified.length > 0
          ? `The books are out by ${bs.discrepancy.abs().toString()}, against ${bs.unclassified.length} account id${bs.unclassified.length === 1 ? '' : 's'} the chart of accounts does not contain.`
          : `The books are out by ${bs.discrepancy.abs().toString()}. An entry's postings do not sum to zero, so assets do not equal liabilities plus equity.`,
        offenders: bs.unclassified.length > 0
          ? bs.unclassified.map((l) => l.id).slice(0, 20)
          : unbalanced.slice(0, 20),
      });

  /* ---- Receipts -------------------------------------------------------- */

  // Two failures, opposite directions. A receipt nothing points at is dead
  // weight that still inflates every backup; a transaction pointing at a
  // receipt that is gone shows an "attached" badge that opens nothing.
  if (attachmentIds != null) {
    const stored = new Set(attachmentIds);
    const referenced = new Set(txns.map((t) => t.attachmentRef).filter((r): r is string => !!r));
    const orphans = attachmentIds.filter((id) => !referenced.has(id));
    const dangling = txns.filter((t) => t.attachmentRef && !stored.has(t.attachmentRef));

    if (dangling.length > 0) {
      checks.push({
        id: 'attachment-links', label: 'Receipts', level: 'error',
        detail: `${dangling.length} transaction${dangling.length === 1 ? '' : 's'} claim a receipt that is no longer in the vault, so the attachment cannot be opened.`,
        offenders: dangling.map((t) => t.id).slice(0, 20),
      });
    } else if (orphans.length > 0) {
      checks.push({
        id: 'attachment-links', label: 'Receipts', level: 'warn',
        detail: `${orphans.length} stored receipt${orphans.length === 1 ? ' is' : 's are'} not attached to any transaction. ${orphans.length === 1 ? 'It' : 'They'} take up space and are included in every backup.`,
        offenders: orphans.slice(0, 20),
      });
    } else {
      checks.push({
        id: 'attachment-links', label: 'Receipts', level: 'ok',
        detail: attachmentIds.length === 0
          ? 'No receipts stored.'
          : `All ${attachmentIds.length} stored receipt${attachmentIds.length === 1 ? ' is' : 's are'} attached to a transaction.`,
      });
    }
  }

  /* ---- Money values ---------------------------------------------------- */

  // The bug that took the Dividends screen down: a stored value Decimal rejects.
  // `D` recovers these on read, but a stored-clean vault is one less surprise.
  const dirty: string[] = [];
  for (const t of txns) if (!isCleanMoney(t.amount)) dirty.push(`txn:${t.id}`);
  for (const t of transfers) if (!isCleanMoney(t.amount)) dirty.push(`transfer:${t.id}`);
  for (const d of dividends) if (!isCleanMoney(d.amount)) dirty.push(`dividend:${d.id}`);
  for (const h of holdings) {
    if (!isCleanMoney(h.quantity)) dirty.push(`holding:${h.id}:quantity`);
    if (!isCleanMoney(h.avgCost)) dirty.push(`holding:${h.id}:avgCost`);
  }
  checks.push(dirty.length === 0
    ? { id: 'money-values', label: 'Stored amounts', level: 'ok', detail: 'Every stored amount parses as a number.' }
    : {
        id: 'money-values', label: 'Stored amounts', level: 'warn',
        detail: `${dirty.length} stored amount${dirty.length === 1 ? ' carries' : 's carry'} stray characters — a space or a symbol. They are read correctly, but re-saving the record cleans it.`,
        offenders: dirty.slice(0, 20),
      });

  /* ---- References ------------------------------------------------------ */

  const catIds = new Set(categories.map((c) => c.id));
  const noCat = txns.filter((t) => t.categoryId && !catIds.has(t.categoryId)).map((t) => t.id);
  checks.push(noCat.length === 0
    ? { id: 'txn-categories', label: 'Transaction categories', level: 'ok', detail: 'Every transaction points at a live category.' }
    : {
        id: 'txn-categories', label: 'Transaction categories', level: 'warn',
        detail: `${noCat.length} transaction${noCat.length === 1 ? '' : 's'} reference a deleted category, so they fall out of category totals and the spending donut.`,
        offenders: noCat.slice(0, 20),
      });

  /* ---- Portfolio completeness ------------------------------------------ */

  const unpriced = holdings.filter((h) => h.lastPrice == null || h.lastPrice === '').map((h) => h.id);
  checks.push(unpriced.length === 0
    ? { id: 'holding-prices', label: 'Holding prices', level: 'ok', detail: 'Every holding has a recorded price.' }
    : {
        id: 'holding-prices', label: 'Holding prices', level: 'warn',
        detail: `${unpriced.length} holding${unpriced.length === 1 ? ' is' : 's are'} valued at cost because no price is recorded, so portfolio value is understated.`,
        offenders: unpriced.slice(0, 20),
      });

  // A fixed-income holding with no rate is the ₹0-return bug in record form.
  const noRate = holdings
    .filter((h) => ['bond', 'fd', 'ppf_epf', 'ssy'].includes(h.assetType))
    .filter((h) => !h.couponRatePct || D(h.couponRatePct).lte(0))
    .map((h) => h.id);
  checks.push(noRate.length === 0
    ? { id: 'fixed-income-rates', label: 'Interest rates', level: 'ok', detail: 'Every interest-bearing holding has a rate.' }
    : {
        id: 'fixed-income-rates', label: 'Interest rates', level: 'warn',
        detail: `${noRate.length} deposit or bond ha${noRate.length === 1 ? 's' : 've'} no interest rate recorded, so ${noRate.length === 1 ? 'it earns' : 'they earn'} nothing and report zero return.`,
        offenders: noRate.slice(0, 20),
      });

  const noDate = holdings.filter((h) => h.firstPurchaseDate == null).map((h) => h.id);
  checks.push(noDate.length === 0
    ? { id: 'holding-dates', label: 'Purchase dates', level: 'ok', detail: 'Every holding has a purchase date.' }
    : {
        id: 'holding-dates', label: 'Purchase dates', level: 'warn',
        detail: `${noDate.length} holding${noDate.length === 1 ? ' has' : 's have'} no purchase date, so the Tax Centre cannot tell short-term gains from long-term.`,
        offenders: noDate.slice(0, 20),
      });

  /* ---- Lots ------------------------------------------------------------ */

  // Two records of the same truth drift. Drift here means the Tax Centre and
  // the portfolio disagree about the same position.
  const drifted = holdings
    .filter((h) => lots.some((l) => l.holdingId === h.id))
    .filter((h) => !reconcileLots(h, lots).ok)
    .map((h) => h.id);
  const withLots = new Set(lots.map((l) => l.holdingId)).size;
  checks.push(drifted.length === 0
    ? {
        id: 'lot-reconciliation', label: 'Purchase lots', level: 'ok',
        detail: withLots === 0
          ? 'No purchase lots recorded. Capital gains use the position average, which cannot split a part short-term sale.'
          : `All ${withLots} position${withLots === 1 ? '' : 's'} with lots reconcile to their recorded quantity and average cost.`,
      }
    : {
        id: 'lot-reconciliation', label: 'Purchase lots', level: 'error',
        detail: `${drifted.length} position${drifted.length === 1 ? "'s lots do" : "s' lots do"} not add up to the recorded quantity or average cost, so tax figures and portfolio value disagree.`,
        offenders: drifted,
      });

  /* ---- Currency --------------------------------------------------------- */

  const approxFx = holdings.filter(hasApproximateFx).map((h) => h.id);
  checks.push(approxFx.length === 0
    ? { id: 'fx-rates', label: 'Exchange rates', level: 'ok', detail: 'Every foreign holding records the rate it was bought at.' }
    : {
        id: 'fx-rates', label: 'Exchange rates', level: 'warn',
        detail: `${approxFx.length} foreign holding${approxFx.length === 1 ? ' has' : 's have'} no purchase exchange rate, so cost is converted at today's rate and currency movement is reported as a capital gain.`,
        offenders: approxFx,
      });

  // The other half of the same problem. A purchase rate that was never recorded
  // is one failure; a CURRENT rate nobody has touched for months is another,
  // and it silently mis-values every foreign holding at once. Unrecorded is
  // reported louder than merely old, because a built-in seed is a guess.
  const foreignCodes = [...new Set(
    holdings.map((h) => h.currency ?? 'INR').filter((c) => c !== 'INR'),
  )];
  if (foreignCodes.length > 0) {
    const never = foreignCodes.filter((c) => rateAsOf(c, fxRates) == null);
    const stale = foreignCodes.filter((c) => isRateStale(c, fxRates, now));
    checks.push(never.length > 0
      ? {
          id: 'fx-current', label: 'Current exchange rates', level: 'error',
          detail: `No exchange rate has ever been recorded for ${never.join(', ')}, so those holdings are valued using a built-in default that may be years out of date. Set it in Settings → Exchange rates.`,
          offenders: never,
        }
      : stale.length > 0
        ? {
            id: 'fx-current', label: 'Current exchange rates', level: 'warn',
            detail: `The rate for ${stale.join(', ')} has not been updated in over ${FX_STALE_DAYS} days. Every holding in that currency is valued at it.`,
            offenders: stale,
          }
        : { id: 'fx-current', label: 'Current exchange rates', level: 'ok', detail: 'Recorded and recent for every currency you hold.' });
  }

  return checks;
}

export const worstLevel = (checks: Check[]): CheckLevel =>
  checks.some((c) => c.level === 'error') ? 'error'
    : checks.some((c) => c.level === 'warn') ? 'warn'
      : 'ok';

/**
 * The checks a restore refuses on. Deliberately an allowlist, not
 * `level === 'error'`: these describe structural corruption — a book that does
 * not balance is not a recovery. Everything else at error level describes data
 * the user has not supplied yet (`fx-current`: a rate never set) or state the
 * incoming snapshot cannot have (`record-readable`, `attachment-links`), and
 * must never stand between someone and their only backup.
 *
 * A restore blocked on a rate nobody had typed yet is what prompted this: the
 * file was intact, and there was no way through the message.
 */
export const RESTORE_BLOCKING: ReadonlySet<string> = new Set([
  'ledger-balanced', 'posting-accounts', 'balance-sheet', 'lot-reconciliation',
]);

/** The subset of `checks` that is reason enough to refuse a restore. */
export const restoreBlockers = (checks: Check[]): Check[] =>
  checks.filter((c) => c.level === 'error' && RESTORE_BLOCKING.has(c.id));
