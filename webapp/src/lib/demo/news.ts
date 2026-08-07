/**
 * Demo news feed.
 *
 * Fixed, hand-written headlines — not generated, so nothing here can produce a
 * sentence that reads as investment advice. Stories are matched to the user's
 * own symbols so the feed looks relevant, but the copy is static.
 *
 * Like everything under `lib/demo/`, this is synthesised and must be rendered
 * behind a DemoBadge. See `marketFeed.ts` for the reasoning.
 */
import { dayKey } from './marketFeed';

export type NewsCategory =
  | 'Monetary Policy' | 'Earnings' | 'Markets' | 'Corporate Action'
  | 'Commodities' | 'Regulation' | 'Sector';

export interface NewsStory {
  id: string;
  title: string;
  category: NewsCategory;
  /** Hours before now. Rendered as "2h ago" / "Yesterday". */
  agoHours: number;
  /** Tickers this touches. Matched against the user's holdings and watchlist. */
  symbols: string[];
  source: string;
}

/**
 * The pool. Deliberately observational — no story tells anyone what to do, so
 * the feed cannot contradict `NARRATIVE_DISCLAIMER` or the banned-phrase rule
 * that governs generated copy elsewhere in the app.
 */
const POOL: Omit<NewsStory, 'id'>[] = [
  { title: 'RBI holds the repo rate at 5.75% for a third consecutive review', category: 'Monetary Policy', agoHours: 2, symbols: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK', 'KOTAKBANK'], source: 'Policy statement' },
  { title: 'Infosys raises FY27 revenue guidance to 7–9% in constant currency', category: 'Earnings', agoHours: 4, symbols: ['INFY', 'TCS', 'WIPRO', 'HCLTECH'], source: 'Company filing' },
  { title: 'Nifty 50 closes at 27,412, up 0.58% led by financials', category: 'Markets', agoHours: 5, symbols: ['NIFTYBEES'], source: 'Exchange summary' },
  { title: 'Reliance Retail files for a separate listing in Q1 FY28', category: 'Corporate Action', agoHours: 26, symbols: ['RELIANCE'], source: 'Company filing' },
  { title: 'Gold holds above ₹78,400 per 10g as the dollar softens', category: 'Commodities', agoHours: 30, symbols: ['GOLDBEES', 'SGBAUG29'], source: 'Bullion desk' },
  { title: 'Tata Motors reports a 14% rise in August domestic dispatches', category: 'Sector', agoHours: 50, symbols: ['TATAMOTORS', 'MARUTI'], source: 'Company filing' },
  { title: 'SEBI extends the T+0 settlement window to the top 500 scrips', category: 'Regulation', agoHours: 54, symbols: [], source: 'Regulator circular' },
  { title: 'Sun Pharma receives USFDA approval for a generic oncology drug', category: 'Sector', agoHours: 74, symbols: ['SUNPHARMA'], source: 'Company filing' },
  { title: 'HDFC Bank completes the merger of its housing-finance book', category: 'Corporate Action', agoHours: 80, symbols: ['HDFCBANK'], source: 'Company filing' },
  { title: 'Cement volumes rise 6% year on year on infrastructure demand', category: 'Sector', agoHours: 96, symbols: ['ULTRACEMCO', 'ASIANPAINT'], source: 'Industry body' },
  { title: 'ITC declares an interim dividend of ₹6.25 per share', category: 'Corporate Action', agoHours: 102, symbols: ['ITC'], source: 'Company filing' },
  { title: 'Bharti Airtel adds 2.4 million subscribers in the July cycle', category: 'Sector', agoHours: 120, symbols: ['BHARTIARTL'], source: 'Regulator data' },
];

/**
 * Stories relevant to the given symbols, newest first.
 *
 * Portfolio-wide stories (those with no symbols) always qualify. When nothing
 * matches — an empty vault, say — the whole pool is returned rather than an
 * empty page, because the screen's job here is to show what the feed looks
 * like.
 */
export function demoNews(symbols: string[], now: Date = new Date()): NewsStory[] {
  const held = new Set(symbols.map((s) => s.toUpperCase()));
  const relevant = POOL.filter((s) => s.symbols.length === 0 || s.symbols.some((t) => held.has(t)));
  const chosen = relevant.length >= 4 ? relevant : POOL;
  const day = dayKey(now);
  return chosen
    .map((s, i) => ({ ...s, id: `news-${day}-${i}` }))
    .sort((a, b) => a.agoHours - b.agoHours);
}

/** "2h ago" / "Yesterday" / "3 days ago". */
export function agoLabel(hours: number): string {
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}
