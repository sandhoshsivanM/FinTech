// Offline SMS / push-notification transaction parser — mirrors
// packages/khazana_domain/lib/services/notification_parser.dart. Pure, in-memory: the raw message
// text is never returned or stored (zero-telemetry privacy boundary). Both
// implementations are pinned by test/fixtures/parser_cases.json.
//
// Every pattern runs on text that has been length-capped and had its whitespace
// collapsed to single spaces. That is a security property, not tidiness: the
// input can come from any app's notification, and adjacent `\s*` groups over a
// long run of spaces backtrack polynomially (ReDoS).
import Decimal from 'decimal.js';
import { D } from './money';
import type { TxnType } from './types';

export interface BankProfile {
  id: string;
  name: string;
  senderKeywords: string[];
}

export const defaultBankProfiles: BankProfile[] = [
  { id: 'hdfc', name: 'HDFC Bank', senderKeywords: ['hdfc'] },
  { id: 'icici', name: 'ICICI Bank', senderKeywords: ['icici'] },
  { id: 'sbi', name: 'State Bank of India', senderKeywords: ['sbi'] },
  { id: 'axis', name: 'Axis Bank', senderKeywords: ['axis'] },
  { id: 'kotak', name: 'Kotak Mahindra Bank', senderKeywords: ['kotak'] },
  // Keywords also match the message body when the sender is unknown, so each
  // one must be distinctive: 'bob' or 'yes' alone would hit ordinary words, and
  // 'bank of india' is inside 'state bank of india'. Short codes are DLT sender
  // headers (VM-CANBNK, AD-YESBNK, ...).
  { id: 'canara', name: 'Canara Bank', senderKeywords: ['canbnk', 'canara'] },
  { id: 'pnb', name: 'Punjab National Bank', senderKeywords: ['pnbsms', 'pnb'] },
  { id: 'bob', name: 'Bank of Baroda', senderKeywords: ['bobtxn', 'bobsms', 'bank of baroda'] },
  { id: 'union', name: 'Union Bank of India', senderKeywords: ['unionb', 'union bank'] },
  { id: 'indusind', name: 'IndusInd Bank', senderKeywords: ['indusb', 'indusind'] },
  { id: 'yes', name: 'Yes Bank', senderKeywords: ['yesbnk', 'yes bank'] },
  { id: 'idfc', name: 'IDFC First Bank', senderKeywords: ['idfcfb', 'idfc'] },
  { id: 'federal', name: 'Federal Bank', senderKeywords: ['fedbnk', 'federal bank'] },
  { id: 'idbi', name: 'IDBI Bank', senderKeywords: ['idbibk', 'idbi'] },
  { id: 'boi', name: 'Bank of India', senderKeywords: ['boiind', 'boibnk'] },
  { id: 'au', name: 'AU Small Finance Bank', senderKeywords: ['aubank', 'au small finance'] },
  { id: 'paytm', name: 'Paytm Payments Bank', senderKeywords: ['paytmb', 'paytm payments bank'] },
];

/** The payment rail or product a message is about. */
export type CaptureInstrument = 'account' | 'credit_card' | 'debit_card' | 'upi' | 'unknown';

/** What the money movement means — a refund and a card-bill payment are not income. */
export type CaptureKind = 'spend' | 'income' | 'refund' | 'card_bill_payment';

export interface ParsedNotification {
  timestamp: string; // 'YYYY-MM-DD'
  amount: Decimal; // always positive; sign comes from `type`
  merchant: string; // '' when none could be extracted
  uncategorized: boolean; // true when there's no signal to auto-categorize
  type: TxnType; // debit → expense, credit → income
  profileId: string | null;
  /** UPI / IMPS reference (12 digits) or NEFT UTR (alphanumeric), uppercased. */
  utr: string | null;
  /** Last digits of the masked account or card ("XX1234" → "1234"). */
  accountLast4: string | null;
  /** The "Avl Bal" figure after this transaction. Never a card limit. */
  availableBalance: Decimal | null;
  instrument: CaptureInstrument;
  kind: CaptureKind;
}

/** Longer than any bank alert; anything bigger is not one. */
export const MAX_LENGTH = 2000;

const DEBIT_WORDS = ['debited', 'spent', 'withdrawn', 'paid', 'purchase', 'debit', 'sent'];
const CREDIT_WORDS = ['credited', 'received', 'deposited', 'refunded', 'refund', 'credit'];

const WHITESPACE_RE = /\s+/g;
const CARD_PHRASE_RE = /\b(?:credit|debit) card\b/g;
const OTP_RE = /\botp\b|one[ -]time password|verification code/;
const FAILED_RE = /\b(?:declined|failed|unsuccessful|not processed|could not be processed)\b/;
const PROMO_RE =
  /\b(?:pre-?approved|eligible|apply now|apply today|up ?to|limited period|offer|congratulations|instant loan|personal loan)\b/;
const REFUND_RE = /\b(?:refund|refunded|reversed|reversal)\b/;
const PAYMENT_RE = /\bpayment\b/;

const AMOUNT_RE = /(?:rs[.:]?|inr|₹) ?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/;
// Bank of Baroda and others put the direction right after the amount:
// "Rs.500.00 Dr. from A/C XX1234 and Cr. to shop@upi". Only an amount-adjacent
// Dr/Cr counts, so a payee called "Dr Sharma" never flips the direction.
const AMOUNT_DIR_RE = /(?:rs[.:]?|inr|₹) ?[0-9][0-9,]*(?:\.[0-9]{1,2})? ?(dr|cr)\b/;
const BARE_AMOUNT_RE = /\b(?:debited|credited) (?:by|with|for) ([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/;
const BALANCE_RE =
  /(?:available balance|avl\.? ?bal(?:ance)?|a\/c bal(?:ance)?|\bbal(?:ance)?) ?(?:is )?:? ?(?:rs[.:]?|inr|₹)? ?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/;
const BALANCE_RE_G = new RegExp(BALANCE_RE.source, 'g');
const LIMIT_RE_G =
  /(?:avl\.? ?(?:lmt|limit)|available (?:credit )?limit) ?:? ?(?:rs[.:]?|inr|₹)? ?[0-9][0-9,]*(?:\.[0-9]{1,2})?/g;
// Rail prefixes ("towards UPI/swiggy@ybl", "to VPA shop@icici") are skipped so
// the name is the payee, not the payment method.
const MERCHANT_RE_G =
  /(?:\btowards|\bvpa|\bat|\bto) (?:(?:upi|neft|imps|rtgs)(?:\/| to )|vpa )?([a-z0-9][a-z0-9 &@_-]*?) ?(?:[.,(]|\bon\b|\bvia\b|\bref|\btxn\b|\bavl\b|\busing\b|\binfo\b|\bfrom\b|\bupi\b|$)/g;
// Credits name the sender with "from". Only tried for income, and only after
// MERCHANT_RE_G found nothing, because debits say "from your a/c" too.
const PAYER_RE_G =
  /\bfrom (?:(?:upi|neft|imps|rtgs)(?:\/| to )|vpa )?([a-z0-9][a-z0-9 &@_-]*?) ?(?:[.,(]|\bon\b|\bvia\b|\bref|\btxn\b|\bavl\b|\busing\b|\binfo\b|\bfrom\b|\bupi\b|$)/g;
// "debited to your account XXX4321" names the user's own account, not a payee.
const OWN_ACCOUNT_RE = /^(?:your\b|ac\b|acct\b|account\b|[x*]{2,}[0-9])/;

function merchantOf(lower: string, re: RegExp): string | null {
  for (const m of lower.matchAll(re)) {
    const raw = m[1]?.trim();
    if (!raw || OWN_ACCOUNT_RE.test(raw)) continue;
    return raw;
  }
  return null;
}
const DATE_RE = /\bon (\d{1,2}[-/][A-Za-z0-9]{2,3}[-/]\d{2,4}|\d{4}-\d{2}-\d{2})/;

// A reference only counts after a keyword: a bare 12-digit run is as likely to
// be a mobile number with its country code (91XXXXXXXXXX).
const UTR_RE =
  /\b(?:upi ?ref(?:erence)?|imps ?ref|ref(?:erence)?|rrn|utr|txn ?id|transaction id|upi)(?: ?(?:no\.?|number|id))? ?(?:[.:#-] ?)?(?:is )?([0-9]{12}|[a-z]{4}[a-z0-9]{12,18})\b/;
const ACCOUNT_RE = /\b(?:a\/c|acct|account|ac)(?: ?(?:no\.?|number))? ?(?:[.:#-] ?)?[x*]+ ?([0-9]{3,6})/;
const CARD_RE = /\bcard(?: ?(?:no\.?|number|ending(?: (?:in|with))?))? ?(?:[.:#-] ?)?[x*]* ?([0-9]{4})\b/;
const MASK_RE = /\b[x*]{2,}([0-9]{3,6})\b/;
const VPA_RE = /[a-z0-9._-]+@[a-z]/;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const ymdInts = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** Parses a bank statement-style embedded date to 'YYYY-MM-DD' (no timezone). */
function parseEmbeddedDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return ymdInts(y, parseInt(m[2], 10), parseInt(m[1], 10));
  }
  m = /^(\d{1,2})[ -]([A-Za-z]{3})[ -](\d{2,4})$/.exec(s);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon) {
      let y = parseInt(m[3], 10);
      if (y < 100) y += 2000;
      return ymdInts(y, mon, parseInt(m[1], 10));
    }
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return ymdInts(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
  return null;
}

/** Local-date 'YYYY-MM-DD' for the SMS-arrival fallback timestamp. */
function localYmd(epochMs: number): string {
  const d = new Date(epochMs);
  return ymdInts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function parseAmount(raw: string | undefined): Decimal | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[,₹\s]/g, '').replace(/-/g, '');
  return cleaned ? D(cleaned) : null;
}

/** The sender is the stronger signal, so it is checked against every profile first. */
function matchProfile(lower: string, sender: string | undefined, profiles: BankProfile[]): string | null {
  const s = sender?.toLowerCase();
  if (s) {
    for (const p of profiles) if (p.senderKeywords.some((kw) => s.includes(kw))) return p.id;
  }
  for (const p of profiles) if (p.senderKeywords.some((kw) => lower.includes(kw))) return p.id;
  return null;
}

function last4(lower: string): string | null {
  const digits = ACCOUNT_RE.exec(lower)?.[1] ?? CARD_RE.exec(lower)?.[1] ?? MASK_RE.exec(lower)?.[1];
  if (digits === undefined) return null;
  return digits.length > 4 ? digits.substring(digits.length - 4) : digits;
}

function instrumentOf(lower: string): CaptureInstrument {
  if (lower.includes('credit card')) return 'credit_card';
  if (lower.includes('debit card')) return 'debit_card';
  if (lower.includes('upi') || lower.includes('vpa') || VPA_RE.test(lower)) return 'upi';
  if (lower.includes('a/c') || lower.includes('acct') || lower.includes('account')) return 'account';
  return 'unknown';
}

export function parseNotification(
  raw: string,
  opts: { now?: number; sender?: string; profiles?: BankProfile[] } = {},
): ParsedNotification | null {
  if (raw.length > MAX_LENGTH) return null;
  const profiles = opts.profiles ?? defaultBankProfiles;
  const lower = raw.toLowerCase().replace(WHITESPACE_RE, ' ').trim();

  if (OTP_RE.test(lower) || FAILED_RE.test(lower)) return null;

  const availableBalance = parseAmount(BALANCE_RE.exec(lower)?.[1]);
  const cleaned = lower.replace(BALANCE_RE_G, ' ').replace(LIMIT_RE_G, ' ');

  // Read from `cleaned` so a balance printed as "Rs 9,000.00 Cr" is not
  // mistaken for the direction of the transaction.
  const dir = AMOUNT_DIR_RE.exec(cleaned)?.[1];
  const words = lower.replace(CARD_PHRASE_RE, 'card');
  const hasDebit = dir !== undefined ? dir === 'dr' : DEBIT_WORDS.some((w) => words.includes(w));
  const hasCredit = dir !== undefined ? dir === 'cr' : CREDIT_WORDS.some((w) => words.includes(w));
  const isRefund = REFUND_RE.test(words);
  if (!hasDebit && !hasCredit && !isRefund) return null;

  const isCardBill =
    lower.includes('card') &&
    PAYMENT_RE.test(lower) &&
    (lower.includes('received') || lower.includes('credited'));
  const amount = parseAmount(AMOUNT_RE.exec(cleaned)?.[1] ?? BARE_AMOUNT_RE.exec(cleaned)?.[1]);
  if (!amount || amount.isZero()) return null;

  const utr = UTR_RE.exec(lower)?.[1]?.toUpperCase() ?? null;
  const accountLast4 = last4(lower);

  // A promotion quotes an amount and a "credited" too, but never a masked
  // account or a reference number — a real alert almost always carries one.
  if (utr === null && accountLast4 === null && PROMO_RE.test(lower)) return null;

  const type: TxnType = isRefund || isCardBill ? 'income' : hasDebit ? 'expense' : 'income';
  const kind: CaptureKind = isCardBill
    ? 'card_bill_payment'
    : isRefund
      ? 'refund'
      : type === 'income'
        ? 'income'
        : 'spend';

  const merchant =
    merchantOf(lower, MERCHANT_RE_G) ?? (type === 'income' ? merchantOf(lower, PAYER_RE_G) : null);

  const dm = DATE_RE.exec(lower);
  const timestamp = (dm && parseEmbeddedDate(dm[1])) ?? localYmd(opts.now ?? Date.now());

  return {
    timestamp,
    amount,
    merchant: merchant ?? '',
    uncategorized: merchant === null,
    type,
    profileId: matchProfile(lower, opts.sender, profiles),
    utr,
    accountLast4,
    availableBalance,
    instrument: instrumentOf(lower),
    kind,
  };
}

/**
 * Dedupe key input — hashed or compared by the caller. A reference number wins,
 * with the direction attached so both legs of a self-transfer survive. Without
 * one, the available balance is what tells two identical spends apart.
 */
export const fingerprintInput = (p: ParsedNotification): string =>
  p.utr !== null
    ? `utr|${p.utr}|${p.type}`
    : `${p.timestamp}|${p.amount.toString()}|${p.merchant}|${p.accountLast4 ?? ''}|${p.availableBalance?.toString() ?? ''}`;
