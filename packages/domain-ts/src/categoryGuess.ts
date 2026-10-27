// Keyword guess of a category name from a narration or merchant. Ported from
// webapp/src/lib/txnImport.ts (the offline app keeps its copy until it moves
// onto this one), so both web apps file the same text under the same name.
import type { TxnType } from './types';

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
export function guessCategory(description: string, kind: TxnType | 'transfer'): string {
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
