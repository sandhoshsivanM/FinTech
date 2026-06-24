// Quick-add natural language parser (PRD §3 Phase 2 / WealthCare). Pure Dart→TS.
// e.g. "spent 450 on groceries at bigbasket" → {amount, type, category, merchant}
import type { TxnType } from '@/lib/types';

const INCOME_WORDS = ['received', 'got', 'earned', 'salary', 'credited', 'refund', 'income'];

export interface ParsedTxn {
  amount: string | null;
  type: TxnType;
  categoryName: string | null;
  merchant: string | null;
  note: string;
}

export function parseQuickAdd(input: string, categoryNames: string[]): ParsedTxn {
  const text = input.trim();
  const lower = text.toLowerCase();
  const type: TxnType = INCOME_WORDS.some((w) => lower.includes(w)) ? 'income' : 'expense';

  // Amount: first number, optionally with k/lakh suffix or ₹.
  const m = lower.match(/(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|l|cr|crore)?/i);
  let amount: string | null = null;
  if (m) {
    let n = parseFloat(m[1].replace(/,/g, ''));
    const suf = m[2]?.toLowerCase();
    if (suf === 'k') n *= 1000;
    else if (suf === 'l' || suf === 'lakh') n *= 100000;
    else if (suf === 'cr' || suf === 'crore') n *= 10000000;
    if (!isNaN(n)) amount = String(n);
  }

  // Category: best keyword match against known names.
  let categoryName: string | null = null;
  for (const name of categoryNames) {
    if (lower.includes(name.toLowerCase())) { categoryName = name; break; }
  }

  // Merchant: token(s) after "at" / "from" / "to".
  let merchant: string | null = null;
  const mm = text.match(/\b(?:at|from|to)\s+([A-Za-z0-9&'. ]{2,30})/i);
  if (mm) merchant = mm[1].trim().replace(/\s+(on|for|the)$/i, '');

  return { amount, type, categoryName, merchant, note: text };
}
