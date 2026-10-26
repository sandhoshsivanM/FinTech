/**
 * Bank SMS → review inbox, the web half of the Flutter capture pipeline
 * (`lib/features/capture/services/capture_pipeline.dart`).
 *
 * Privacy boundary: the raw message text comes in and only the parsed values
 * go out. Nothing here stores, logs or returns the text, so the vault never
 * holds a copy of a bank message — the same promise the Android app makes.
 *
 * Every capture waits for the user. There is no auto-post on web: a pasted or
 * Mac-read message is approved, edited or rejected by hand, which is also what
 * keeps a parser mistake from ever reaching the ledger unseen.
 */
import { fingerprintInput, parseNotification, type ParsedNotification } from '@khazana/domain/notificationParser';
import type { Category, CaptureSource, PendingCapture, Txn, TxnType } from '@khazana/domain/types';
import { D } from '@khazana/domain/money';
import { guessCategory } from './txnImport';

export interface CaptureInput {
  text: string;
  sender?: string;
  source: CaptureSource;
  /** When the message arrived; defaults to now. Dates a message that has none. */
  receivedAt?: number;
}

export type CaptureOutcome = 'added' | 'duplicate' | 'not_a_transaction';

/**
 * How long a decided capture is kept. It is the dedup memory: while it exists,
 * the same message pasted or read again is recognised and not queued twice.
 */
export const DECIDED_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** At most this many messages from one paste — a bank alert is short. */
export const MAX_MESSAGES_PER_PASTE = 50;

/** Labels for the Dart `ReviewReason` keys this client produces. */
export const REVIEW_REASON_LABELS: Record<string, string> = {
  no_merchant: 'No merchant in the message',
  no_category: 'No category learned for this merchant yet',
  refund: 'Refund — check it matches an earlier purchase',
  card_bill_payment: 'Card bill payment — a transfer, not income',
  possible_duplicate: 'Looks like a transaction already recorded',
};

export const isPendingCapture = (c: PendingCapture) => (c.status ?? 'pending') === 'pending';

/**
 * One paste can hold several messages. Bank alerts are a paragraph each, so a
 * blank line is the separator; a single message with line breaks stays whole.
 */
export function splitMessages(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, MAX_MESSAGES_PER_PASTE);
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const localYmd = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * A message dated today keeps its arrival time, so two spends on the same day
 * sort the way they happened. One dated another day has only the date, and
 * gets local noon — midnight would slip a day in any timezone west of here.
 */
function occurredAt(p: ParsedNotification, receivedAt: number): number {
  if (p.timestamp === localYmd(receivedAt)) return receivedAt;
  const [y, m, d] = p.timestamp.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

/**
 * The category to pre-select: whatever this merchant was filed under last
 * time, else a keyword guess, else nothing. Learning from the ledger rather
 * than a separate alias table means a correction made anywhere teaches it.
 */
export function suggestCategory(
  merchant: string, type: TxnType, txns: Txn[], categories: Category[],
): string | null {
  const known = new Set(categories.map((c) => c.id));
  const m = merchant.trim().toLowerCase();
  if (m) {
    let latest: Txn | null = null;
    for (const t of txns) {
      if (t.type !== type || (t.merchant ?? '').trim().toLowerCase() !== m) continue;
      if (!known.has(t.categoryId)) continue;
      if (!latest || t.date > latest.date) latest = t;
    }
    if (latest) return latest.categoryId;
  }
  const name = guessCategory(merchant, type).toLowerCase();
  if (!name) return null;
  return categories.find((c) => c.name.toLowerCase() === name)?.id ?? null;
}

/** Same day, same amount, same direction — the import screen's duplicate test, loosened for a missing merchant. */
function looksRecorded(p: ParsedNotification, at: number, txns: Txn[]): boolean {
  const day = localYmd(at);
  return txns.some((t) => t.type === p.type && localYmd(t.date) === day && D(t.amount).eq(p.amount));
}

export interface CapturePlan {
  captures: PendingCapture[];
  /** One per input, in order. */
  outcomes: CaptureOutcome[];
}

/**
 * Turns messages into review-inbox drafts. Pure apart from hashing: the caller
 * writes `captures` in one batch.
 *
 * A fingerprint already in the vault — pending, approved or rejected — is a
 * duplicate and is skipped. That is what stops a rejected message from coming
 * back every time the Mac rereads Messages.
 */
export async function planCaptures(
  inputs: CaptureInput[],
  ctx: {
    vaultId: string;
    now: number;
    existing: PendingCapture[];
    txns: Txn[];
    categories: Category[];
    newId: () => string;
  },
): Promise<CapturePlan> {
  const seen = new Set(ctx.existing.map((c) => c.fingerprint));
  const captures: PendingCapture[] = [];
  const outcomes: CaptureOutcome[] = [];

  for (const input of inputs) {
    const receivedAt = input.receivedAt ?? ctx.now;
    const p = parseNotification(input.text, { now: receivedAt, sender: input.sender });
    if (!p) {
      outcomes.push('not_a_transaction');
      continue;
    }
    const fingerprint = await sha256Hex(fingerprintInput(p));
    if (seen.has(fingerprint)) {
      outcomes.push('duplicate');
      continue;
    }
    seen.add(fingerprint);

    const at = occurredAt(p, receivedAt);
    const categoryId = suggestCategory(p.merchant, p.type, ctx.txns, ctx.categories);
    const reasons: string[] = [];
    if (p.uncategorized) reasons.push('no_merchant');
    if (!categoryId) reasons.push('no_category');
    if (p.kind === 'refund') reasons.push('refund');
    if (p.kind === 'card_bill_payment') reasons.push('card_bill_payment');
    if (looksRecorded(p, at, ctx.txns)) reasons.push('possible_duplicate');

    captures.push({
      id: ctx.newId(),
      vaultId: ctx.vaultId,
      amount: p.amount.toString(),
      type: p.type,
      merchant: p.merchant || null,
      occurredAt: at,
      source: input.source,
      uncategorized: p.uncategorized,
      fingerprint,
      capturedAt: ctx.now,
      status: 'pending',
      reasons,
      categoryId,
      utr: p.utr,
      accountLast4: p.accountLast4,
      instrument: p.instrument,
      kind: p.kind,
    });
    outcomes.push('added');
  }
  return { captures, outcomes };
}

/** Decided captures past the dedup window — safe to delete. */
export function staleCaptureIds(captures: PendingCapture[], now: number): string[] {
  return captures
    .filter((c) => !isPendingCapture(c) && (c.decidedAt ?? c.capturedAt) < now - DECIDED_TTL_MS)
    .map((c) => c.id);
}

export interface CaptureEdits {
  amount?: string;
  type?: TxnType;
  merchant?: string | null;
  categoryId?: string;
  accountId?: string | null;
  date?: number;
}

/**
 * The transaction an approval writes, and the capture as it should be stored
 * afterwards. A changed amount, direction, merchant or date marks it
 * `edited_approved` and keeps the parsed amount, so parser mistakes stay
 * countable; picking a category is the normal job of review and is not an edit.
 */
export function approvalRecords(
  c: PendingCapture,
  edits: CaptureEdits,
  ctx: { now: number; txnId: string },
): { txn: Txn; capture: PendingCapture } {
  const categoryId = edits.categoryId ?? c.categoryId;
  if (!categoryId) throw new Error('Choose a category before approving.');
  const amount = edits.amount ?? c.amount;
  if (!(D(amount).gt(0))) throw new Error('The amount must be more than zero.');
  const type = edits.type ?? c.type;
  const merchant = edits.merchant !== undefined ? (edits.merchant?.trim() || null) : (c.merchant ?? null);
  const date = edits.date ?? c.occurredAt;
  const accountId = edits.accountId !== undefined ? edits.accountId : (c.accountId ?? null);

  const edited =
    !D(amount).eq(c.amount) || type !== c.type || merchant !== (c.merchant ?? null) || date !== c.occurredAt;

  const txn: Txn = {
    id: ctx.txnId,
    vaultId: c.vaultId,
    profileId: c.profileId,
    amount: D(amount).toString(),
    type,
    categoryId,
    merchant,
    date,
    createdAt: ctx.now,
    ...(accountId ? { accountId } : {}),
  };
  const capture: PendingCapture = {
    ...c,
    status: edited ? 'edited_approved' : 'approved',
    categoryId,
    accountId,
    finalAmount: edited && !D(amount).eq(c.amount) ? D(amount).toString() : null,
    decidedAt: ctx.now,
    postedTxnId: txn.id,
  };
  return { txn, capture };
}

export function rejectionRecord(c: PendingCapture, now: number): PendingCapture {
  return { ...c, status: 'rejected', decidedAt: now };
}
