/**
 * Bank statement and transaction-CSV import.
 *
 * One auto-detecting engine rather than a parser per bank. Indian statements
 * vary in column *names* far more than in column *meaning*, so aliases plus a
 * header-row scan cover HDFC, SBI, ICICI, IDFC, Kotak and the Qatar banks from
 * the same code path — and, importantly, cover the next bank too. Picking the
 * wrong institution in the UI is therefore harmless.
 *
 * Two statement shapes exist in the wild and both are handled:
 *
 *   A. Separate debit/credit columns — "Withdrawal Amt." / "Deposit Amt."
 *      The populated column carries the direction.
 *   B. One signed amount column, sometimes with a separate Dr/Cr indicator.
 *
 * A row is only accepted when a date and a non-zero amount both parse.
 * Everything else is counted and surfaced: silently dropping transactions from
 * a statement is worse than importing none, because the user would reconcile
 * against a total that was never complete.
 */
import type { DividendKind, Txn, TxnType } from './types';
import { findHeaderRow, headerIndex, num } from './sheet';
import { detectDayFirst, parseDateCell } from './dateParse';

export type ImportedKind = TxnType | 'transfer';

export interface ParsedTxnRow {
  /** Epoch ms, local midnight. */
  date: number;
  description: string;
  /** Positive magnitude, 2dp. Direction lives in `kind`. */
  amount: string;
  kind: ImportedKind;
  /** Resolved later against the vault's categories; '' means auto-detect. */
  category: string;
  fromAccount: string;
  toAccount: string;
  notes: string;
  /** Running balance where the statement carried one. Preview only. */
  balance: string;
}

export interface TxnParseResult {
  rows: ParsedTxnRow[];
  skipped: number;
  /** Header row index that was used, for the "detected columns" note. */
  headerRow: number;
  columns: string[];
  error?: string;
}

const ALIASES = {
  date: ['date', 'txn date', 'transaction date', 'value date', 'posting date', 'tran date', 'booking date'],
  desc: ['narration', 'description', 'particulars', 'transaction remarks', 'remarks', 'details', 'transaction details', 'merchant', 'payee'],
  debit: ['withdrawal amt', 'withdrawal', 'debit amount', 'debit amt', 'debit', 'dr amount', 'paid out', 'money out'],
  credit: ['deposit amt', 'deposit', 'credit amount', 'credit amt', 'credit', 'cr amount', 'paid in', 'money in'],
  amount: ['amount', 'transaction amount', 'amt', 'value'],
  /** Dr/Cr flag that qualifies a single amount column. */
  drcr: ['dr / cr', 'dr/cr', 'type', 'txn type', 'transaction type', 'indicator', 'cr/dr'],
  balance: ['closing balance', 'balance', 'running balance', 'available balance'],
  category: ['category', 'tag'],
  currency: ['currency', 'ccy'],
  fromAccount: ['from_account', 'from account', 'source account'],
  toAccount: ['to_account', 'to account', 'destination account'],
  notes: ['notes', 'note', 'comment'],
};

/** The two columns without which nothing can be imported. */
const REQUIRED = [ALIASES.date, [...ALIASES.debit, ...ALIASES.credit, ...ALIASES.amount]];

/** Reads a Dr/Cr-style cell. Returns null when the cell says nothing useful. */
function directionOf(cell: string | undefined): ImportedKind | null {
  const v = String(cell ?? '').trim().toLowerCase();
  if (!v) return null;
  if (/^(transfer|trf|xfer)$/.test(v)) return 'transfer';
  if (/^(dr|debit|withdrawal|w|out|expense|exp|paid)/.test(v)) return 'expense';
  if (/^(cr|credit|deposit|c|in|income|inc|received)/.test(v)) return 'income';
  return null;
}

/**
 * Parses a grid into transaction rows.
 *
 * `defaultKind` only applies when the file states no direction at all — a
 * single unsigned amount column with no Dr/Cr flag. That is a real format, and
 * guessing "expense" for it silently is how an import turns a salary credit
 * into a spend; the UI states the assumption instead.
 */
export function parseTxnRows(rows: string[][], defaultKind: TxnType = 'expense'): TxnParseResult {
  if (!rows.length) {
    return { rows: [], skipped: 0, headerRow: -1, columns: [], error: 'That file is empty.' };
  }

  const hIdx = findHeaderRow(rows, REQUIRED);
  if (hIdx === -1) {
    return {
      rows: [], skipped: 0, headerRow: -1, columns: [],
      error: 'Could not find a header row with a date and an amount column. Check that the export includes column titles.',
    };
  }

  const headers = rows[hIdx];
  const iDate = headerIndex(headers, ALIASES.date);
  const iDesc = headerIndex(headers, ALIASES.desc);
  const iDebit = headerIndex(headers, ALIASES.debit);
  const iCredit = headerIndex(headers, ALIASES.credit);
  const iAmount = headerIndex(headers, ALIASES.amount);
  const iDrCr = headerIndex(headers, ALIASES.drcr);
  const iBalance = headerIndex(headers, ALIASES.balance);
  const iCategory = headerIndex(headers, ALIASES.category);
  const iFrom = headerIndex(headers, ALIASES.fromAccount);
  const iTo = headerIndex(headers, ALIASES.toAccount);
  const iNotes = headerIndex(headers, ALIASES.notes);

  const missing = [
    iDate === -1 && 'date',
    iDebit === -1 && iCredit === -1 && iAmount === -1 && 'amount',
  ].filter(Boolean) as string[];
  if (missing.length) {
    return {
      rows: [], skipped: Math.max(0, rows.length - hIdx - 1), headerRow: hIdx, columns: headers,
      error: `Could not find a column for ${missing.join(' and ')}. Columns found: ${headers.filter(Boolean).join(', ')}`,
    };
  }

  const body = rows.slice(hIdx + 1);
  // Column-level decision — see detectDayFirst.
  const dayFirst = detectDayFirst(body.map((r) => r[iDate] ?? ''));

  /**
   * Does the amount column use signs to carry direction?
   *
   * Like the date order, this is a property of the column, not of a cell. One
   * negative anywhere proves the export signs its debits, which makes every
   * positive row a credit. Without that evidence the column is unsigned and
   * the direction genuinely is not in the file — only then does `defaultKind`
   * apply. Deciding this per-row instead would read a signed file's salary
   * credit as an expense.
   */
  const signedAmounts =
    iAmount !== -1 &&
    body.some((r) => {
      const a = num(r[iAmount]);
      return Number.isFinite(a) && a < 0;
    });

  const out: ParsedTxnRow[] = [];
  let skipped = 0;

  for (const r of body) {
    const date = parseDateCell(r[iDate] ?? '', dayFirst);
    if (date == null) { skipped++; continue; }

    let kind: ImportedKind | null = null;
    let magnitude = NaN;

    // Shape A: whichever of the debit/credit pair is populated wins.
    if (iDebit !== -1 || iCredit !== -1) {
      const dr = iDebit !== -1 ? num(r[iDebit]) : NaN;
      const cr = iCredit !== -1 ? num(r[iCredit]) : NaN;
      if (Number.isFinite(dr) && dr !== 0) { kind = 'expense'; magnitude = Math.abs(dr); }
      else if (Number.isFinite(cr) && cr !== 0) { kind = 'income'; magnitude = Math.abs(cr); }
    }

    // Shape B: one amount column, direction from a flag or from the sign.
    if (kind == null && iAmount !== -1) {
      const a = num(r[iAmount]);
      if (Number.isFinite(a) && a !== 0) {
        magnitude = Math.abs(a);
        // Precedence: an explicit Dr/Cr flag, then the column's sign
        // convention, then the caller's stated default. Each step is a fact
        // the file actually carries; only the last is an assumption, and the
        // UI names it.
        kind = (iDrCr !== -1 ? directionOf(r[iDrCr]) : null)
          ?? (signedAmounts ? (a < 0 ? 'expense' : 'income') : defaultKind);
      }
    }

    if (kind == null || !Number.isFinite(magnitude) || magnitude <= 0) { skipped++; continue; }

    const description = (iDesc !== -1 ? r[iDesc] ?? '' : '').replace(/\s+/g, ' ').trim();
    const from = iFrom !== -1 ? (r[iFrom] ?? '').trim() : '';
    const to = iTo !== -1 ? (r[iTo] ?? '').trim() : '';
    // A row that names both endpoints is a transfer regardless of its flag —
    // the template documents from_account/to_account as exactly that.
    if (from && to) kind = 'transfer';

    out.push({
      date,
      description,
      amount: magnitude.toFixed(2),
      kind,
      category: iCategory !== -1 ? (r[iCategory] ?? '').trim() : '',
      fromAccount: from,
      toAccount: to,
      notes: iNotes !== -1 ? (r[iNotes] ?? '').trim() : '',
      balance: iBalance !== -1 ? (r[iBalance] ?? '').trim() : '',
    });
  }

  return { rows: out, skipped, headerRow: hIdx, columns: headers };
}

/* -------------------------------------------------------------------------- */
/* Category auto-detection                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Keyword → category name. Matched against the narration, longest rule first.
 * Names line up with DEFAULT_CATEGORIES; anything unmatched stays uncategorised
 * so the user can see and fix it, rather than being buried in "Other".
 */
const CATEGORY_HINTS: { re: RegExp; category: string }[] = [
  // Dividend and interest credits are investment income, not generic "Other".
  // Placed first so a narration naming both a company and a keyword below
  // (e.g. "RELIANCE DIV") is not captured by a retail rule.
  { re: /\bdiv(idend)?\b|\bint\.?\s?(cr|credit)\b|interest credit|\bipo refund\b|buyback|\bbonus\b/i, category: 'Investment' },
  { re: /salary|payroll|stipend|wages|neft.*sal/i, category: 'Salary' },
  { re: /swiggy|zomato|restaurant|cafe|coffee|pizza|dominos|mcdonald|food|bakery|hotel/i, category: 'Food' },
  { re: /uber|ola|rapido|irctc|petrol|fuel|hpcl|iocl|bpcl|metro|toll|fastag|parking/i, category: 'Transport' },
  { re: /rent|lease|landlord|maintenance charge/i, category: 'Rent' },
  { re: /electricity|water bill|gas bill|broadband|airtel|jio|vodafone|bsnl|recharge|dth|tneb|bescom/i, category: 'Utilities' },
  { re: /amazon|flipkart|myntra|ajio|meesho|nykaa|shopping|mall|store|mart|bigbasket|blinkit|zepto|dmart/i, category: 'Shopping' },
  { re: /pharmacy|apollo|hospital|clinic|medical|doctor|diagnostic|health|medplus/i, category: 'Health' },
  { re: /netflix|spotify|prime video|hotstar|bookmyshow|cinema|pvr|inox|gaming|steam/i, category: 'Entertainment' },
  { re: /emi|loan repay|instal?ment|home loan|car loan/i, category: 'EMI' },
  { re: /sip|mutual fund|zerodha|groww|upstox|coin|nps|ppf|invest|broker|demat/i, category: 'Investment' },
];

/** Best-guess category name for a narration, or '' when nothing matches. */
export function guessCategory(description: string, kind: ImportedKind): string {
  if (kind === 'transfer') return '';
  for (const h of CATEGORY_HINTS) {
    if (h.re.test(description)) {
      // A salary rule must not label an outgoing payment as income.
      if (h.category === 'Salary' && kind !== 'income') continue;
      return h.category;
    }
  }
  return '';
}

/* -------------------------------------------------------------------------- */
/* Dividends                                                                  */
/* -------------------------------------------------------------------------- */

/** Narrations that describe investment income rather than a plain credit. */
const DIVIDEND_PATTERNS: { re: RegExp; kind: DividendKind }[] = [
  { re: /\bbuyback\b/i, kind: 'buyback' },
  { re: /\bbonus\b/i, kind: 'bonus' },
  { re: /\bint\.?\s?(cr|credit)\b|interest credit|\bintt?\b.*\bcredit\b/i, kind: 'interest' },
  { re: /\bdiv(idend|d)?\b/i, kind: 'dividend' },
];

/**
 * Classifies a credit as investment income, or null when it is an ordinary one.
 * Only ever applied to incoming money — "DIVIDEND MANDATE DEBIT" is not income.
 */
export function dividendKindOf(description: string, kind: ImportedKind): DividendKind | null {
  if (kind !== 'income') return null;
  for (const p of DIVIDEND_PATTERNS) if (p.re.test(description)) return p.kind;
  return null;
}

/**
 * Finds which of the user's own holdings a narration is talking about.
 *
 * Matched against the book the user already has, never against a general list
 * of tickers: "ACH C/ RELIANCE INDUSTRIES LTD DIV" should only become a
 * RELIANCE dividend if RELIANCE is actually held. Guessing a symbol from free
 * text would attach payouts to positions that do not exist.
 *
 * Longest name first, so "TATA MOTORS" wins over a bare "TATA" holding.
 */
export function matchHolding(
  description: string,
  holdings: { symbol: string; name?: string | null }[],
): string | null {
  const hay = description.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ');
  const candidates = holdings
    .flatMap((h) => [
      { symbol: h.symbol, token: (h.name ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim() },
      { symbol: h.symbol, token: h.symbol.toUpperCase() },
    ])
    // A 2-character token would match almost any narration by accident.
    .filter((c) => c.token.length >= 3)
    .sort((a, b) => b.token.length - a.token.length);

  for (const c of candidates) {
    // Word-boundary match so "ITC" does not fire inside "SWITCH".
    if (new RegExp(`\\b${c.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay)) {
      return c.symbol;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Duplicate detection                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Identity of a transaction for import purposes: same day, same magnitude,
 * same direction, same narration.
 *
 * Re-importing an overlapping date range is the normal way people use this —
 * you export "last 3 months" every month — so the importer has to be safe to
 * run twice. Matching on the narration as well as the amount is what keeps two
 * genuinely distinct ₹200 coffees on the same day from collapsing into one.
 */
export function txnFingerprint(
  date: number,
  amount: string,
  kind: ImportedKind,
  description: string,
): string {
  const day = new Date(date);
  const ymd = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
  const amt = Number(amount).toFixed(2);
  const desc = description.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
  return `${ymd}|${amt}|${kind}|${desc}`;
}

export interface TxnImportPlan {
  fresh: ParsedTxnRow[];
  duplicates: ParsedTxnRow[];
}

/**
 * Splits parsed rows into new and already-present.
 *
 * Deduplicates within the file too, not just against the vault — a statement
 * that repeats a row (or two overlapping exports concatenated by hand) would
 * otherwise import the repeat.
 */
export function planTxnImport(rows: ParsedTxnRow[], existing: Txn[]): TxnImportPlan {
  const seen = new Set(
    existing.map((t) =>
      txnFingerprint(t.date, t.amount, t.type, t.merchant ?? t.note ?? ''),
    ),
  );
  const fresh: ParsedTxnRow[] = [];
  const duplicates: ParsedTxnRow[] = [];
  for (const r of rows) {
    const fp = txnFingerprint(r.date, r.amount, r.kind, r.description);
    if (seen.has(fp)) { duplicates.push(r); continue; }
    seen.add(fp);
    fresh.push(r);
  }
  return { fresh, duplicates };
}
