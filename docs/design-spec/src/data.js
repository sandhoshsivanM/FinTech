/**
 * The demo vault, as reference data.
 *
 * Every row is copied verbatim from `webapp/src/lib/sampleData.ts` — the same
 * vault the Settings screen loads — and the derived figures below are computed
 * with the same arithmetic the app's domain modules use. Nothing in this file
 * is invented; if a number appears in an artboard, it traces to here.
 *
 * The vault is dated relative to a pinned "today" so the document is
 * reproducible: a spec whose figures shift between builds is not a spec.
 */

/** Pinned so repeated builds are byte-comparable. */
export const TODAY = new Date('2026-08-09T00:00:00+05:30');

const DAY = 86400000;
export const daysAgo = (n) => new Date(TODAY.getTime() - n * DAY);
export const daysAhead = (n) => new Date(TODAY.getTime() + n * DAY);

// ---- Formatting (mirrors lib/money.ts and lib/format.ts) ------------------
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** `formatMoney` — the full en-IN form, e.g. ₹24,56,780.00 */
export const money = (n) => inr.format(n);
/** Whole-rupee form used wherever paise are noise. */
export const money0 = (n) => inr0.format(n);

/** `Money.compact` — ₹1.2Cr / ₹1.2L / ₹90k / ₹450 */
export function compact(n) {
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(a / 1e7 >= 100 ? 0 : 2)}Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(a / 1e5 >= 100 ? 0 : 2)}L`;
  if (a >= 1e3) return `${s}₹${Math.round(a / 1e3)}k`;
  return `${s}₹${Math.round(a)}`;
}

export const signed = (n, f = compact) => (n > 0 ? `+${f(n)}` : f(n));
export const pct = (n, d = 2) => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(d)}%`;
export const qty = (n) => new Intl.NumberFormat('en-IN').format(n);

export const dmy = (d) => `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`;
export const dm = (d) => `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-GB', { month: 'short' })}`;

/** Deterministic 0..1 — the FNV hash from sampleData.ts, so wobbles match. */
export function rnd(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h ^ (h >>> 16)) >>> 8) / 16777216;
}

// ---- Instrument master (public/instrument_master.json) --------------------
/** symbol -> [sector, industry, cap] */
const MASTER = {
  RELIANCE: ['Oil, Gas & Consumable Fuels', 'Refineries', 'large'],
  HDFCBANK: ['Financial Services', 'Banks', 'large'],
  INFY: ['Information Technology', 'IT - Software', 'large'],
  TCS: ['Information Technology', 'IT - Software', 'large'],
  ICICIBANK: ['Financial Services', 'Banks', 'large'],
  BHARTIARTL: ['Telecommunication', 'Telecom - Services', 'large'],
  LT: ['Capital Goods', 'Civil Construction', 'large'],
  ITC: ['Fast Moving Consumer Goods', 'Diversified FMCG', 'large'],
  SBIN: ['Financial Services', 'Banks', 'large'],
  ASIANPAINT: ['Consumer Durables', 'Paints', 'large'],
  MARUTI: ['Automobile & Auto Components', 'Passenger Cars', 'large'],
  SUNPHARMA: ['Healthcare', 'Pharmaceuticals', 'large'],
  TITAN: ['Consumer Durables', 'Gems & Jewellery', 'large'],
  BAJFINANCE: ['Financial Services', 'Finance', 'large'],
  HINDUNILVR: ['Fast Moving Consumer Goods', 'Diversified FMCG', 'large'],
  AXISBANK: ['Financial Services', 'Banks', 'large'],
  WIPRO: ['Information Technology', 'IT - Software', 'large'],
  ULTRACEMCO: ['Construction Materials', 'Cement', 'large'],
  TATAMOTORS: ['Automobile & Auto Components', 'Passenger Cars', 'large'],
  HCLTECH: ['Information Technology', 'IT - Software', 'large'],
  GOLDBEES: ['Unclassified', 'Exchange Traded Fund', null],
  NIFTYBEES: ['Unclassified', 'Exchange Traded Fund', null],
  'SBI-CORPBOND': ['Unclassified', 'Debt Fund', null],
  'NPS-TIER1': ['Unclassified', 'Pension', null],
};

// ---- Asset groups (domain/portfolio.ts ASSET_GROUP_ORDER / _META) ---------
/** Fixed render order. This order IS the colourblind-safety mechanism. */
export const ASSET_GROUPS = [
  ['equity', 'Equity', '#4eb982'],
  ['debt', 'Debt', '#a4aaf6'],
  ['gold', 'Gold', '#c19c3a'],
  ['real_estate', 'Real Estate', '#63a1d5'],
  ['retirement', 'Retirement', '#ea8760'],
  ['crypto', 'Crypto', '#73c7cc'],
  ['cash', 'Cash', '#ca7cb4'],
];

const TYPE_GROUP = {
  equity_etf: 'equity', equity_mf: 'equity', ulip: 'equity',
  debt_mf: 'debt', bond: 'debt',
  gold_etf: 'gold', sgb: 'gold',
  real_estate: 'real_estate',
  fd: 'retirement', ppf_epf: 'retirement', ssy: 'retirement', nps: 'retirement',
  crypto: 'crypto', cash: 'cash',
};

const TYPE_LABEL = {
  equity_etf: 'Equity / ETF', equity_mf: 'Equity MF', debt_mf: 'Debt MF', bond: 'Bonds',
  gold_etf: 'Gold', sgb: 'SGB', cash: 'Cash', real_estate: 'Real Estate', crypto: 'Crypto',
  fd: 'Fixed Deposit', ppf_epf: 'PPF / EPF', ssy: 'Sukanya Samriddhi', nps: 'NPS', ulip: 'ULIP',
};

// ---- Holdings -------------------------------------------------------------
/** [symbol, name, qty, avgCost, lastPrice, assetType, daysHeld] */
const RAW_HOLDINGS = [
  ['RELIANCE', 'Reliance Industries', 420, 2118.40, 2645.00, 'equity_etf', 780],
  ['HDFCBANK', 'HDFC Bank', 1180, 1486.20, 1712.55, 'equity_etf', 910],
  ['INFY', 'Infosys', 960, 1298.00, 1695.40, 'equity_etf', 1120],
  ['TCS', 'Tata Consultancy Services', 310, 3410.00, 4022.10, 'equity_etf', 640],
  ['ICICIBANK', 'ICICI Bank', 1420, 842.60, 1118.30, 'equity_etf', 1240],
  ['BHARTIARTL', 'Bharti Airtel', 760, 1042.00, 1486.75, 'equity_etf', 690],
  ['LT', 'Larsen & Toubro', 290, 2860.00, 3512.40, 'equity_etf', 520],
  ['ITC', 'ITC', 2100, 392.40, 441.85, 'equity_etf', 830],
  ['SBIN', 'State Bank of India', 1650, 542.10, 612.00, 'equity_etf', 460],
  ['ASIANPAINT', 'Asian Paints', 260, 3080.00, 2764.30, 'equity_etf', 610],
  ['MARUTI', 'Maruti Suzuki', 96, 10240.00, 12488.00, 'equity_etf', 720],
  ['SUNPHARMA', 'Sun Pharmaceutical', 480, 1128.00, 1642.90, 'equity_etf', 950],
  ['TITAN', 'Titan Company', 210, 2940.00, 3388.60, 'equity_etf', 400],
  ['BAJFINANCE', 'Bajaj Finance', 115, 6820.00, 6412.55, 'equity_etf', 330],
  ['HINDUNILVR', 'Hindustan Unilever', 340, 2510.00, 2386.40, 'equity_etf', 560],
  ['AXISBANK', 'Axis Bank', 880, 948.30, 1104.20, 'equity_etf', 480],
  ['WIPRO', 'Wipro', 1900, 398.50, 462.30, 'equity_etf', 870],
  ['ULTRACEMCO', 'UltraTech Cement', 64, 9420.00, 10986.00, 'equity_etf', 300],
  ['TATAMOTORS', 'Tata Motors', 1240, 742.00, 968.45, 'equity_etf', 540],
  ['HCLTECH', 'HCL Technologies', 540, 1284.00, 1516.80, 'equity_etf', 700],
  ['GOLDBEES', 'Nippon India Gold BeES', 9800, 49.20, 62.80, 'gold_etf', 620],
  ['NIFTYBEES', 'Nippon India Nifty 50 BeES', 4200, 218.60, 286.40, 'equity_etf', 1010],
  ['SBI-CORPBOND', 'SBI Corporate Bond Fund', 18000, 32.40, 36.85, 'debt_mf', 430],
  ['NPS-TIER1', 'NPS Tier I — Scheme E', 12400, 28.90, 35.20, 'nps', 1350],
];

/**
 * `holdingView` from domain/portfolio.ts. None of the demo holdings is
 * fixed-income (bond/fd/ppf_epf/ssy), so all of them price as qty × price;
 * the accrual path is documented in Part F rather than exercised here.
 *
 * Day change is synthesised the way demo/marketFeed.ts does it — deterministic
 * from the symbol — and is flagged as demo data wherever it appears.
 */
export const HOLDINGS = RAW_HOLDINGS.map(([symbol, name, q, avg, last, assetType, days]) => {
  const invested = q * avg;
  const current = q * last;
  const pnl = current - invested;
  const dayPct = (rnd(`${symbol}|2026-08-09`) - 0.5) * 5.2;
  const [sector, industry, cap] = MASTER[symbol];
  return {
    symbol, name, qty: q, avg, last, assetType,
    group: TYPE_GROUP[assetType],
    typeLabel: TYPE_LABEL[assetType],
    sector, industry, cap,
    firstPurchase: daysAgo(days),
    invested, current, pnl,
    pnlPct: (pnl / invested) * 100,
    dayPct,
    dayPnl: current * (dayPct / 100),
    prevClose: last / (1 + dayPct / 100),
  };
});

const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);

export const PORTFOLIO = {
  invested: sum(HOLDINGS, (h) => h.invested),
  current: sum(HOLDINGS, (h) => h.current),
  dayPnl: sum(HOLDINGS, (h) => h.dayPnl),
  count: HOLDINGS.length,
  totalQty: sum(HOLDINGS, (h) => h.qty),
};
PORTFOLIO.pnl = PORTFOLIO.current - PORTFOLIO.invested;
PORTFOLIO.pnlPct = (PORTFOLIO.pnl / PORTFOLIO.invested) * 100;
PORTFOLIO.dayPct = (PORTFOLIO.dayPnl / (PORTFOLIO.current - PORTFOLIO.dayPnl)) * 100;

/** `rollup(holdings, dimension)` — must sum exactly to the portfolio total. */
export function rollup(dimension) {
  const map = new Map();
  for (const h of HOLDINGS) {
    const key = dimension === 'group' ? h.group : dimension === 'sector' ? h.sector : dimension === 'cap' ? (h.cap ?? 'Unclassified') : h.typeLabel;
    const row = map.get(key) ?? { key, current: 0, invested: 0, n: 0 };
    row.current += h.current; row.invested += h.invested; row.n += 1;
    map.set(key, row);
  }
  const rows = [...map.values()].map((r) => ({
    ...r, pnl: r.current - r.invested, pnlPct: ((r.current - r.invested) / r.invested) * 100,
    share: (r.current / PORTFOLIO.current) * 100,
  }));
  // Asset groups keep their fixed order; every other dimension sorts by value,
  // which is safe because those charts are labelled, not colour-coded alone.
  if (dimension === 'group') {
    const order = ASSET_GROUPS.map(([k]) => k);
    return rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
      .map((r) => ({ ...r, label: ASSET_GROUPS.find(([k]) => k === r.key)[1], color: ASSET_GROUPS.find(([k]) => k === r.key)[2] }));
  }
  return rows.sort((a, b) => b.current - a.current).map((r) => ({ ...r, label: r.key }));
}

export const gainers = [...HOLDINGS].sort((a, b) => b.pnlPct - a.pnlPct);
export const losers = [...HOLDINGS].sort((a, b) => a.pnlPct - b.pnlPct);
export const byValue = [...HOLDINGS].sort((a, b) => b.current - a.current);
export const dayMovers = [...HOLDINGS].sort((a, b) => b.dayPct - a.dayPct);

// ---- Accounts, cash, ledger ----------------------------------------------
export const ACCOUNTS = [
  { id: 'salary', name: 'HDFC Salary', subtype: 'bank', opening: 180000, balance: 1425000 },
  { id: 'spends', name: 'ICICI Spends', subtype: 'bank', opening: 42000, balance: 132891 },
  { id: 'emergency', name: 'Emergency Fund', subtype: 'bank', opening: 1420000, balance: 1495000 },
];
export const CASH = sum(ACCOUNTS, (a) => a.balance);

export const LIABILITIES = [
  { name: 'HDFC Home Loan', kind: 'loan', principal: 4820000, apr: 8.6, term: 216, emi: 42980 },
  { name: 'Car Loan', kind: 'loan', principal: 412000, apr: 9.4, term: 48, emi: 10334 },
  { name: 'HDFC Credit Card', kind: 'credit_card', principal: 86400, apr: 42, limit: 400000 },
];
export const DEBT = sum(LIABILITIES, (l) => l.principal);

/**
 * Net worth as the app actually computes it — `netWorth(accounts, postings,
 * holdings)` in domain/accountLedger.ts — not as the seeded snapshots claim.
 *
 * These disagree in the shipped demo vault. `sampleData.ts` backfills ninety
 * days of history ending at a hardcoded ₹5.24 Cr, but the holdings and accounts
 * it seeds add up to less than half that. The app is right and the backfill is
 * decorative; this document uses the computed figure everywhere and normalises
 * the snapshot curve onto it (see `SNAPSHOTS` below). Part F records the
 * discrepancy — it is exactly the class of thing the Diagnostics screen exists
 * to surface.
 */
export const NET_WORTH = CASH + PORTFOLIO.current - DEBT;

/** The figure `sampleData.ts` hardcodes, kept for the appendix note. */
export const SEEDED_END_NET = 52_400_000;

// ---- Categories & spending ------------------------------------------------
/** The 11 defaults, in seed order (store.ts:179 / default_categories.dart). */
export const CATEGORIES = ['Food', 'Transport', 'Rent', 'Utilities', 'Shopping', 'Health', 'Entertainment', 'EMI', 'Salary', 'Investment', 'Other'];

/** [amount, category, daysAgo, merchant] — the discretionary spends. */
export const SPENDS = [
  [1240, 'Food', 0, 'Swiggy'], [420, 'Food', 1, 'Blue Tokai'], [980, 'Transport', 1, 'Uber'],
  [8460, 'Shopping', 3, 'Amazon India'], [3250, 'Food', 4, 'BigBasket'], [640, 'Transport', 6, 'Ola'],
  [2400, 'Health', 9, 'Apollo Pharmacy'], [1180, 'Entertainment', 12, 'BookMyShow'],
  [1450, 'Food', 15, 'Third Wave'], [6300, 'Shopping', 18, 'Myntra'], [1760, 'Food', 22, 'Zomato'],
  [4200, 'Transport', 27, 'Fuel'], [5200, 'Shopping', 35, 'IKEA'], [3480, 'Food', 40, 'Toit'],
  [890, 'Transport', 44, 'Metro card'], [9500, 'Shopping', 52, 'Decathlon'], [2600, 'Health', 70, 'Clinic'],
];

/** Fixed monthly outgo, repeated at 92/62/32/2 days ago. */
export const FIXED = [
  [58000, 'Rent', 'Landlord'],
  [64820, 'EMI', 'HDFC Home Loan'],
  [4310, 'Utilities', 'Tata Power'],
  [649, 'Entertainment', 'Netflix'],
];
export const SIP = [45000, 'Investment', 'Zerodha — SIP'];
export const SALARY = 285000;

/** The current month's ledger, newest first — what /transactions shows. */
export const LEDGER = (() => {
  const rows = [];
  for (const [amount, category, d, merchant] of SPENDS) rows.push({ amount, category, d, merchant, type: 'expense' });
  for (const [amount, category, merchant] of FIXED) for (const d of [92, 62, 32, 2]) rows.push({ amount, category, d, merchant, type: 'expense' });
  for (const d of [95, 65, 35, 5]) rows.push({ amount: SIP[0], category: SIP[1], d, merchant: SIP[2], type: 'expense' });
  for (const d of [90, 60, 30, 1]) rows.push({ amount: SALARY, category: 'Salary', d, merchant: 'Aurelius Systems', type: 'income' });
  rows.push({ amount: 2400000, category: 'Salary', d: 95, merchant: 'Opening balance', type: 'income' });
  for (const d of [89, 59, 29]) {
    rows.push({ amount: 150000, d, type: 'transfer', from: 'HDFC Salary', to: 'ICICI Spends', note: 'Monthly spending float' });
    rows.push({ amount: 25000, d, type: 'transfer', from: 'HDFC Salary', to: 'Emergency Fund', note: 'Emergency fund top-up' });
  }
  return rows.sort((a, b) => a.d - b.d);
})();

/** This month = the last 30 days, which is the window the Budget screen uses. */
const thisMonth = LEDGER.filter((r) => r.d <= 30 && r.type === 'expense');
export const spentByCategory = (cat) => sum(thisMonth.filter((r) => r.category === cat), (r) => r.amount);

export const MONTH_INCOME = SALARY;
export const MONTH_EXPENSE = sum(thisMonth, (r) => r.amount);
export const SAVINGS_RATE = ((MONTH_INCOME - MONTH_EXPENSE) / MONTH_INCOME) * 100;

export const BUDGETS = [
  ['Food', 18000], ['Transport', 8000], ['Shopping', 15000], ['Entertainment', 5000], ['Health', 6000],
].map(([category, limit]) => {
  const spent = spentByCategory(category);
  const f = spent / limit;
  return { category, limit, spent, fraction: f, status: f > 0.9 ? 'over' : f >= 0.7 ? 'warning' : 'ok' };
});

/** Days remaining in the calendar month — what the budget copy counts down to. */
export const DAYS_LEFT = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0).getDate() - TODAY.getDate();

/**
 * `safeToSpend` from domain/insights.ts, scoped to the budget envelope.
 *
 * The unscoped version nets upcoming recurring out of income, which double-counts
 * in this vault: the monthly fixed block is already paid two days ago AND due
 * again as a rule. Scoping to budgeted categories is the reading the screen
 * actually shows, and it is the one that stays true.
 */
export const SAFE_TO_SPEND = (() => {
  const limit = sum(BUDGETS, (b) => b.limit);
  const spent = sum(BUDGETS, (b) => b.spent);
  const remaining = limit - spent;
  return { limit, spent, remaining, daysLeft: DAYS_LEFT, perDay: remaining / DAYS_LEFT };
})();

/** The budget closest to breaching — what the dashboard insight names. */
export const TIGHTEST_BUDGET = [...BUDGETS].sort((a, b) => b.fraction - a.fraction)[0];

// ---- Everything else ------------------------------------------------------
export const GOALS = [
  { name: 'Retirement corpus', type: 'custom', target: 120000000, current: 48263910, inDays: 6570 },
  { name: 'Home down payment', type: 'house', target: 9000000, current: 3840000, inDays: 580 },
  { name: 'Emergency Fund', type: 'emergency_fund', target: 1800000, current: 1495000, linked: 'Emergency Fund' },
  { name: 'Child education', type: 'education', target: 15000000, current: 2260000, inDays: 3200 },
  { name: 'Kyoto, spring', type: 'vacation', target: 450000, current: 186000, inDays: 240 },
];

export const INSURANCE = [
  { name: 'Term Life', type: 'term', provider: 'HDFC Life', cover: 30000000, premium: 28400, renewIn: 96 },
  { name: 'Family Floater', type: 'health', provider: 'Star Health', cover: 2000000, premium: 42600, renewIn: 41 },
  { name: 'Car — comprehensive', type: 'vehicle', provider: 'ICICI Lombard', cover: 900000, premium: 18200, renewIn: 12 },
];

export const RECURRING = [
  { amount: 64820, category: 'EMI', merchant: 'HDFC Home Loan', inDays: 3, type: 'expense' },
  { amount: 649, category: 'Entertainment', merchant: 'Netflix', inDays: 5, type: 'expense' },
  { amount: 4310, category: 'Utilities', merchant: 'Tata Power', inDays: 9, type: 'expense' },
  { amount: 58000, category: 'Rent', merchant: 'Landlord', inDays: 11, type: 'expense' },
  { amount: 285000, category: 'Salary', merchant: 'Aurelius Systems', inDays: 24, type: 'income' },
];

export const WATCHLIST = [
  ['DMART', 'Avenue Supermarts', 4218.60, 4600],
  ['PIDILITIND', 'Pidilite Industries', 3086.40, 2900],
  ['DIVISLAB', 'Divi’s Laboratories', 6104.80, 6800],
  ['ZOMATO', 'Eternal', 288.45, 240],
  ['TATAPOWER', 'Tata Power', 442.90, 500],
  ['NTPC', 'NTPC', 396.20, 450],
].map(([symbol, name, price, target]) => ({
  symbol, name, price, target,
  toTarget: ((target - price) / price) * 100,
  dayPct: (rnd(`${symbol}|2026-08-09`) - 0.5) * 5.2,
}));

/** [symbol, perShare, amount, daysAgo] — negative days are still to come. */
export const DIVIDENDS = [
  ['ITC', 6.25, 13125, 8], ['RELIANCE', 10.00, 4200, 22], ['INFY', 19.50, 18720, 38],
  ['TCS', 27.00, 8370, 54], ['HDFCBANK', 19.50, 23010, 71], ['SBIN', 13.70, 22605, 96],
  ['ITC', 7.50, 15750, -18], ['HINDUNILVR', 24.00, 8160, -32],
].map(([symbol, perShare, amount, d]) => ({ symbol, perShare, amount, d, received: d > 0, date: d > 0 ? daysAgo(d) : daysAhead(-d) }));

export const DIV_RECEIVED = sum(DIVIDENDS.filter((d) => d.received), (d) => d.amount);
export const DIV_EXPECTED = sum(DIVIDENDS.filter((d) => !d.received), (d) => d.amount);

export const ALERTS = [
  { kind: 'price_above', symbol: 'RELIANCE', label: 'RELIANCE: Price rises above 2800', threshold: 2800, current: 2645.00 },
  { kind: 'price_below', symbol: 'BAJFINANCE', label: 'BAJFINANCE: Price falls below 6000', threshold: 6000, current: 6412.55 },
  { kind: 'weight_above', symbol: 'HDFCBANK', label: 'HDFCBANK: Weight exceeds 8%', threshold: 8, current: null },
];

/**
 * 91 days of snapshots, generated by the exact loop in sampleData.ts — then
 * scaled so the series lands on the net worth the ledger actually computes.
 * The shape (the 0.82 start, the wobble, the health ramp) is untouched; only
 * the magnitude is corrected, so the trend chart cannot contradict the KPI
 * printed above it.
 */
export const SNAPSHOTS = (() => {
  const endNet = SEEDED_END_NET, startNet = endNet * 0.82, out = [];
  for (let i = 90; i >= 0; i--) {
    const t = (90 - i) / 90;
    const wobble = (rnd(`snap${i}`) - 0.5) * 0.03 + Math.sin(t * Math.PI * 3.4) * 0.018;
    const net = startNet + (endNet - startNet) * Math.pow(t, 0.95) + endNet * wobble * (1 - Math.abs(t - 0.5));
    out.push({
      date: daysAgo(i), net,
      health: Math.round(58 + t * 16 + wobble * 90),
      trackedWeight: 92,
    });
  }
  const k = NET_WORTH / out[out.length - 1].net;
  return out.map((s) => ({
    ...s,
    net: s.net * k,
    cash: s.net * k * 0.11,
    investments: s.net * k * 0.98,
    liabilities: s.net * k * 0.09,
  }));
})();

export const HEALTH = SNAPSHOTS[SNAPSHOTS.length - 1].health;

// ---- Health-score inputs, computed rather than asserted -------------------
const groups = rollup('group');
const share = (k) => (groups.find((g) => g.key === k)?.share ?? 0);

export const INVESTED_SHARE = (PORTFOLIO.current / (PORTFOLIO.current + CASH)) * 100;
export const CONCENTRATION = Math.max(...groups.map((g) => g.share));
export const GROWTH_ALLOCATION = share('equity') + share('gold');
export const RETIREMENT_VALUE = sum(HOLDINGS.filter((h) => h.group === 'retirement'), (h) => h.current);
export const EMERGENCY_MONTHS = ACCOUNTS.find((a) => a.id === 'emergency').balance / MONTH_EXPENSE;
export const ANNUAL_INCOME = SALARY * 12;
export const LIFE_TARGET = ANNUAL_INCOME * 10;          // LIFE_COVER_MULTIPLE
export const HEALTH_FLOOR = Math.max(500000, ANNUAL_INCOME / 2);
export const LIFE_COVER = INSURANCE.find((p) => p.type === 'term').cover;
export const HEALTH_COVER = INSURANCE.find((p) => p.type === 'health').cover;

/** domain/health.ts — four categories, fixed weights, renormalised over what
 *  is tracked. Untracked is never scored as zero. */
export const HEALTH_CATEGORIES = [
  { key: 'wealth', label: 'Wealth', weight: 30, score: 78, metrics: [
    ['Net-worth trajectory', 12, 'Up 22% across the 90-day window'],
    ['Invested share', 10, `${INVESTED_SHARE.toFixed(0)}% of assets invested — target 40%`],
    ['Concentration', 8, `Largest group is ${CONCENTRATION.toFixed(0)}% of the portfolio`],
  ] },
  { key: 'protection', label: 'Protection', weight: 25, score: 71, metrics: [
    ['Emergency fund', 10, `${EMERGENCY_MONTHS.toFixed(1)} months of expenses — target 6`],
    ['Life cover', 8, `${compact(LIFE_COVER)} against a ${compact(LIFE_TARGET)} target`],
    ['Health cover', 7, `${compact(HEALTH_COVER)} against a ${compact(HEALTH_FLOOR)} floor`],
  ] },
  { key: 'efficiency', label: 'Efficiency', weight: 25, score: 69, metrics: [
    ['Savings rate', 10, `${SAVINGS_RATE.toFixed(0)}% of income retained — target 30%`],
    ['Debt load', 10, 'One APR above 24% applies a ×0.85 factor'],
    ['Budget adherence', 5, `${BUDGETS.filter((b) => b.status !== 'over').length} of ${BUDGETS.length} budgets within limit`],
  ] },
  { key: 'future', label: 'Future', weight: 20, score: 74, metrics: [
    ['Retirement assets', 8, `${compact(RETIREMENT_VALUE)} in NPS`],
    ['Goal pace', 7, `${GOALS.length} goals tracked, 2 ahead of schedule`],
    ['Growth allocation', 5, `Equity and gold at ${GROWTH_ALLOCATION.toFixed(0)}%`],
  ] },
];

export const HEALTH_BANDS = [
  [85, 'Excellent'], [70, 'Strong'], [55, 'Fair'], [40, 'Needs work'], [0, 'At risk'],
];
export const healthGrade = (n) => HEALTH_BANDS.find(([min]) => n >= min)[1];

/** demo/news.ts — the fixed headline set. */
export const NEWS = [
  ['RBI holds the repo rate at 5.75% for a third consecutive review', 'Monetary Policy', 2],
  ['Nifty 50 closes at 27,412, up 0.58% led by financials', 'Markets', 4],
  ['ITC declares an interim dividend of ₹6.25 per share', 'Corporate Action', 7],
  ['Gold holds above ₹78,400 per 10g as the dollar softens', 'Commodities', 9],
  ['IT majors guide to mid-single-digit growth for the year', 'Earnings', 11],
  ['SEBI tightens disclosure norms for AIF pass-through', 'Regulation', 14],
];

/** demo/marketFeed.ts — index levels for /markets. */
export const INDICES = [
  ['NIFTY 50', 27412.35, 0.58], ['SENSEX', 89740.12, 0.51], ['BANK NIFTY', 61208.80, 0.94],
  ['NIFTY MIDCAP 150', 24886.40, -0.32], ['NIFTY SMALLCAP 250', 19204.75, -0.61], ['INDIA VIX', 11.86, -3.10],
];

/** domain/tax.ts — long/short split on the demo positions (India FY25). */
export const TAX = (() => {
  const rows = HOLDINGS.filter((h) => h.pnl > 0).map((h) => {
    const months = (TODAY - h.firstPurchase) / (DAY * 30.44);
    const threshold = h.assetType === 'debt_mf' || h.assetType === 'gold_etf' ? 24 : 12;
    const long = months >= threshold;
    const slab = h.assetType === 'debt_mf' || h.assetType === 'nps';
    const rate = slab ? 30 : long ? 12.5 : 20;
    return { ...h, months, long, slab, rate, gain: h.pnl };
  });
  const ltcg = sum(rows.filter((r) => r.long), (r) => r.gain);
  const stcg = sum(rows.filter((r) => !r.long), (r) => r.gain);
  // ₹1.25 L LTCG exemption on equity, applied once across the book.
  const tax = sum(rows, (r) => (r.long ? Math.max(0, r.gain) * (r.rate / 100) : r.gain * (r.rate / 100)));
  return { rows, ltcg, stcg, tax: tax - 125000 * 0.125, exemption: 125000 };
})();
