// Offline SMS / push-notification transaction parser — mirrors
// lib/domain/services/notification_parser.dart. Pure, in-memory: the raw message
// text is never returned or stored (zero-telemetry privacy boundary). Output
// contract: a text timestamp, a Decimal amount, a merchant string, and a
// fallback "uncategorized" flag.
import Decimal from 'decimal.js';
import { D } from '@/lib/money';
import type { TxnType } from '@/lib/types';

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
];

export interface ParsedNotification {
  timestamp: string; // 'YYYY-MM-DD'
  amount: Decimal; // always positive; sign comes from `type`
  merchant: string; // '' when none could be extracted
  uncategorized: boolean; // true when there's no signal to auto-categorize
  type: TxnType; // debit → expense, credit → income
  profileId: string | null;
}

const DEBIT_WORDS = ['debited', 'spent', 'withdrawn', 'paid', 'purchase', 'debit'];
const CREDIT_WORDS = ['credited', 'received', 'deposited', 'refunded', 'refund', 'credit'];

const AMOUNT_RE = /(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/;
const BALANCE_RE = /(?:available\s+balance|avl\.?\s*bal(?:ance)?|a\/c\s*bal(?:ance)?|bal(?:ance)?)\s*:?\s*(?:rs\.?|inr|₹)?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?/g;
const MERCHANT_RE = /(?:\btowards|\bvpa|\bat|\bto)\s+([a-z0-9][a-z0-9 &@_-]*?)\s*(?:[.,]|\bon\b|\bvia\b|\bref\b|\btxn\b|\bavl\b|\busing\b|\binfo\b|$)/;
const DATE_RE = /\bon\s+(\d{1,2}[-/][A-Za-z0-9]{2,3}[-/]\d{2,4}|\d{4}-\d{2}-\d{2})/;

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

function parseAmount(raw: string): Decimal | null {
  const cleaned = raw.replace(/[,₹\s]/g, '').replace(/-/g, '');
  return cleaned ? D(cleaned) : null;
}

function matchProfile(lower: string, sender: string | undefined, profiles: BankProfile[]): string | null {
  const s = sender?.toLowerCase();
  for (const p of profiles) {
    for (const kw of p.senderKeywords) {
      if (s && s.includes(kw)) return p.id;
      if (lower.includes(kw)) return p.id;
    }
  }
  return null;
}

export function parseNotification(
  raw: string,
  opts: { now?: number; sender?: string; profiles?: BankProfile[] } = {},
): ParsedNotification | null {
  const profiles = opts.profiles ?? defaultBankProfiles;
  const lower = raw.toLowerCase();

  const hasDebit = DEBIT_WORDS.some((w) => lower.includes(w));
  const hasCredit = CREDIT_WORDS.some((w) => lower.includes(w));
  if (!hasDebit && !hasCredit) return null;
  const type: TxnType = hasDebit ? 'expense' : 'income';

  const cleaned = lower.replace(BALANCE_RE, ' ');
  const am = AMOUNT_RE.exec(cleaned);
  if (!am) return null;
  const amount = parseAmount(am[1]);
  if (!amount) return null;

  const mm = MERCHANT_RE.exec(lower);
  const merchantRaw = mm?.[1]?.trim();
  const merchant = merchantRaw && merchantRaw.length > 0 ? merchantRaw : null;

  const dm = DATE_RE.exec(lower);
  const timestamp = (dm && parseEmbeddedDate(dm[1])) ?? localYmd(opts.now ?? Date.now());

  return {
    timestamp,
    amount,
    merchant: merchant ?? '',
    uncategorized: merchant === null,
    type,
    profileId: matchProfile(lower, opts.sender, profiles),
  };
}

/** SHA-256 dedup input (same scheme as bank import) — hashed by the caller. */
export const fingerprintInput = (p: ParsedNotification): string =>
  `${p.timestamp}|${p.amount.toString()}|${p.merchant}`;
