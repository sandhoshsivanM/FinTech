/**
 * The demo vault's records, as data.
 *
 * Two things this has to get right beyond "some numbers":
 *
 *   1. Symbols must exist in `public/instrument_master.json`, or every
 *      sector and market-cap roll-up renders as "Unclassified" and the
 *      allocation screens look broken. The equity names below are all in the
 *      bundled master.
 *   2. Coverage has to reach every screen. A vault with no insurance leaves the
 *      health score's Protection pillar untracked; one with fewer than two
 *      snapshots leaves every trend chart empty. So this seeds insurance,
 *      ninety days of snapshots, dividends, a watchlist and alerts too.
 */
import { STORE } from './types';

/** One record to write: a store name and its value. */
export type SampleEntry = { type: string; value: { id: string } & Record<string, unknown> };

const DAY = 86400000;

/** Deterministic 0..1, so the demo vault is the same every time it is loaded. */
function rnd(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h ^ (h >>> 16)) >>> 8) / 16777216;
}

/** symbol, name, qty, avgCost, lastPrice, assetType, days held */
const HOLDINGS: [string, string, string, string, string, string, number][] = [
  ['RELIANCE', 'Reliance Industries', '420', '2118.40', '2645.00', 'equity_etf', 780],
  ['HDFCBANK', 'HDFC Bank', '1180', '1486.20', '1712.55', 'equity_etf', 910],
  ['INFY', 'Infosys', '960', '1298.00', '1695.40', 'equity_etf', 1120],
  ['TCS', 'Tata Consultancy Services', '310', '3410.00', '4022.10', 'equity_etf', 640],
  ['ICICIBANK', 'ICICI Bank', '1420', '842.60', '1118.30', 'equity_etf', 1240],
  ['BHARTIARTL', 'Bharti Airtel', '760', '1042.00', '1486.75', 'equity_etf', 690],
  ['LT', 'Larsen & Toubro', '290', '2860.00', '3512.40', 'equity_etf', 520],
  ['ITC', 'ITC', '2100', '392.40', '441.85', 'equity_etf', 830],
  ['SBIN', 'State Bank of India', '1650', '542.10', '612.00', 'equity_etf', 460],
  ['ASIANPAINT', 'Asian Paints', '260', '3080.00', '2764.30', 'equity_etf', 610],
  ['MARUTI', 'Maruti Suzuki', '96', '10240.00', '12488.00', 'equity_etf', 720],
  ['SUNPHARMA', 'Sun Pharmaceutical', '480', '1128.00', '1642.90', 'equity_etf', 950],
  ['TITAN', 'Titan Company', '210', '2940.00', '3388.60', 'equity_etf', 400],
  ['BAJFINANCE', 'Bajaj Finance', '115', '6820.00', '6412.55', 'equity_etf', 330],
  ['HINDUNILVR', 'Hindustan Unilever', '340', '2510.00', '2386.40', 'equity_etf', 560],
  ['AXISBANK', 'Axis Bank', '880', '948.30', '1104.20', 'equity_etf', 480],
  ['WIPRO', 'Wipro', '1900', '398.50', '462.30', 'equity_etf', 870],
  ['ULTRACEMCO', 'UltraTech Cement', '64', '9420.00', '10986.00', 'equity_etf', 300],
  ['TATAMOTORS', 'Tata Motors', '1240', '742.00', '968.45', 'equity_etf', 540],
  ['HCLTECH', 'HCL Technologies', '540', '1284.00', '1516.80', 'equity_etf', 700],
  // Non-equity sleeves, so the asset-group donut has more than one arc.
  ['GOLDBEES', 'Nippon India Gold BeES', '9800', '49.20', '62.80', 'gold_etf', 620],
  ['NIFTYBEES', 'Nippon India Nifty 50 BeES', '4200', '218.60', '286.40', 'equity_etf', 1010],
  ['SBI-CORPBOND', 'SBI Corporate Bond Fund', '18000', '32.40', '36.85', 'debt_mf', 430],
  ['NPS-TIER1', 'NPS Tier I — Scheme E', '12400', '28.90', '35.20', 'nps', 1350],
];

/** symbol, name, exchange, price, target */
const WATCHLIST: [string, string, string, string][] = [
  ['DMART', 'Avenue Supermarts', '4218.60', '4600'],
  ['PIDILITIND', 'Pidilite Industries', '3086.40', '2900'],
  ['DIVISLAB', 'Divi’s Laboratories', '6104.80', '6800'],
  ['ZOMATO', 'Eternal', '288.45', '240'],
  ['TATAPOWER', 'Tata Power', '442.90', '500'],
  ['NTPC', 'NTPC', '396.20', '450'],
];

/** symbol, perShare, totalAmount, days ago (negative = still to come) */
const DIVIDENDS: [string, string, string, number][] = [
  ['ITC', '6.25', '13125', 8],
  ['RELIANCE', '10.00', '4200', 22],
  ['INFY', '19.50', '18720', 38],
  ['TCS', '27.00', '8370', 54],
  ['HDFCBANK', '19.50', '23010', 71],
  ['SBIN', '13.70', '22605', 96],
  ['COALINDIA', '5.50', '0', 120],
  ['ITC', '7.50', '15750', -18],
  ['HINDUNILVR', '24.00', '8160', -32],
];


/** Where the sample's money accounts and liabilities end up, for `sampleSnapshots`. */
export interface SampleContext {
  vaultId: string;
  profileId: string;
  /** The vault's categories; names the sample uses are looked up here. */
  categories: { id: string; name: string }[];
  uid: () => string;
  now: number;
}

/**
 * Every record of the sample year except the net-worth history (which needs the
 * loaded balances, see `sampleSnapshots`). Pure: no storage and no clock.
 */
export function sampleEntries(ctx: SampleContext): SampleEntry[] {
  const { vaultId, profileId, categories: cats, uid, now } = ctx;
  const daysAgo = (n: number) => now - n * DAY;
  const entries: SampleEntry[] = [];
  const put = (type: string, value: { id: string } & Record<string, unknown>) => { entries.push({ type, value }); };
  const cat = (name: string): string => (cats.find((c) => c.name === name) ?? cats[0]).id;

  // ---- Accounts -----------------------------------------------------------
  // Three real accounts, the shape most people actually have: salary lands in
  // one, day-to-day spending leaves another, the emergency fund sits apart.
  // Opening balances are what each held before this sample history begins.
  const acct = (id: string, name: string, openingBalance: string) => {
    const full = `acct-${id}-${profileId}`;
    put(STORE.account, {
      id: full, vaultId, profileId, name, type: 'asset', subtype: 'bank', openingBalance,
    });
    return full;
  };
  const SALARY = acct('salary', 'HDFC Salary', '180000');
  const SPENDS = acct('spends', 'ICICI Spends', '42000');
  const EMERGENCY = acct('emergency', 'Emergency Fund', '1420000');

  const txn = (
    amount: string, type: 'expense' | 'income', category: string, dAgo: number,
    merchant?: string, accountId: string = SPENDS,
  ) =>
    put(STORE.txn, { id: uid(), vaultId, profileId, amount, type, categoryId: cat(category), merchant, note: 'Sample', date: daysAgo(dAgo), createdAt: now, accountId });

  // ---- Cash flow ----------------------------------------------------------
  // Pay lands in the salary account; everything else leaves the spends account.
  txn('2400000', 'income', 'Salary', 95, 'Opening balance', SALARY);
  for (const d of [90, 60, 30, 1]) txn('285000', 'income', 'Salary', d, 'Aurelius Systems', SALARY);

  // ---- Transfers ----------------------------------------------------------
  // Salary out to spending money and to the emergency fund. Neither is income
  // or expense, and the Budget and Reports screens should stay blind to them.
  const transfer = (amount: string, from: string, to: string, dAgo: number, note: string) =>
    put(STORE.transfer, {
      id: uid(), vaultId, profileId, amount, fromAccountId: from, toAccountId: to,
      date: daysAgo(dAgo), note, createdAt: now,
    });
  for (const d of [89, 59, 29]) {
    transfer('150000', SALARY, SPENDS, d, 'Monthly spending float');
    transfer('25000', SALARY, EMERGENCY, d, 'Emergency fund top-up');
  }
  for (const d of [92, 62, 32, 2]) {
    txn('58000', 'expense', 'Rent', d, 'Landlord');
    txn('4310', 'expense', 'Utilities', d, 'Tata Power');
    txn('649', 'expense', 'Entertainment', d, 'Netflix');
    txn('64820', 'expense', 'EMI', d, 'HDFC Home Loan');
  }
  const spends: [string, string, number, string][] = [
    ['1240', 'Food', 0, 'Swiggy'], ['420', 'Food', 1, 'Blue Tokai'], ['980', 'Transport', 1, 'Uber'],
    ['8460', 'Shopping', 3, 'Amazon India'], ['3250', 'Food', 4, 'BigBasket'], ['640', 'Transport', 6, 'Ola'],
    ['2400', 'Health', 9, 'Apollo Pharmacy'], ['1180', 'Entertainment', 12, 'BookMyShow'],
    ['6300', 'Shopping', 18, 'Myntra'], ['1760', 'Food', 22, 'Zomato'], ['4200', 'Transport', 27, 'Fuel'],
    ['3480', 'Food', 40, 'Toit'], ['9500', 'Shopping', 52, 'Decathlon'], ['2600', 'Health', 70, 'Clinic'],
    ['1450', 'Food', 15, 'Third Wave'], ['5200', 'Shopping', 35, 'IKEA'], ['890', 'Transport', 44, 'Metro card'],
  ];
  for (const [a, c, d, m] of spends) txn(a, 'expense', c, d, m);
  // SIP purchases, so the Investment category is not empty.
  for (const d of [95, 65, 35, 5]) txn('45000', 'expense', 'Investment', d, 'Zerodha — SIP');

  // ---- Holdings -----------------------------------------------------------
  for (const [symbol, name, qty, avg, last, assetType, dAgo] of HOLDINGS) {
    put(STORE.holding, {
      id: uid(), vaultId, symbol, name, exchange: 'NSE',
      quantity: qty, avgCost: avg, lastPrice: last, assetType,
      firstPurchaseDate: daysAgo(dAgo),
      country: 'IN',
    });
  }

  // ---- Watchlist ----------------------------------------------------------
  for (const [symbol, name, price, target] of WATCHLIST) {
    put(STORE.watchItem, {
      id: uid(), vaultId, symbol, name, exchange: 'NSE',
      lastPrice: price, targetPrice: target, addedAt: daysAgo(Math.floor(rnd(symbol) * 120) + 5),
    });
  }

  // ---- Dividends ----------------------------------------------------------
  for (const [symbol, perShare, amount, dAgo] of DIVIDENDS) {
    if (amount === '0') continue;
    put(STORE.dividend, {
      id: uid(), vaultId, symbol, kind: 'dividend',
      amount, perShare, payDate: daysAgo(dAgo), exDate: daysAgo(dAgo + 12),
      received: dAgo > 0,
    });
  }

  // ---- Alerts -------------------------------------------------------------
  const alert = (kind: string, symbol: string | null, label: string, threshold: string) =>
    put(STORE.alert, { id: uid(), vaultId, kind, symbol, label, threshold, active: true, createdAt: daysAgo(20), lastTriggeredAt: null });
  alert('price_above', 'RELIANCE', 'RELIANCE: Price rises above 2800', '2800');
  alert('price_below', 'BAJFINANCE', 'BAJFINANCE: Price falls below 6000', '6000');
  alert('weight_above', 'HDFCBANK', 'HDFCBANK: Weight exceeds 8%', '8');

  // ---- Liabilities --------------------------------------------------------
  put(STORE.liability, { id: uid(), vaultId, name: 'HDFC Credit Card', kind: 'credit_card', principal: '86400', aprPct: '42', creditLimit: '400000' });
  put(STORE.liability, { id: uid(), vaultId, name: 'HDFC Home Loan', kind: 'loan', principal: '4820000', aprPct: '8.6', termMonths: 216 });
  put(STORE.liability, { id: uid(), vaultId, name: 'Car Loan', kind: 'loan', principal: '412000', aprPct: '9.4', termMonths: 48 });

  // ---- Insurance ----------------------------------------------------------
  // Without at least one policy the health score's Protection pillar is
  // untracked, which makes the Score and Safety Net screens read as broken.
  const policy = (name: string, type: string, provider: string, cover: string, premium: string, renewIn: number) =>
    put(STORE.insurance, { id: uid(), vaultId, name, type, provider, coverAmount: cover, premium, renewalDate: now + renewIn * DAY });
  policy('Term Life', 'term', 'HDFC Life', '30000000', '28400', 96);
  policy('Family Floater', 'health', 'Star Health', '2000000', '42600', 41);
  policy('Car — comprehensive', 'vehicle', 'ICICI Lombard', '900000', '18200', 12);

  // ---- Budgets ------------------------------------------------------------
  const budget = (category: string, limit: string) =>
    put(STORE.budget, { id: uid(), vaultId, categoryId: cat(category), amountLimit: limit, rolloverEnabled: false, alertThresholdPct: 90 });
  budget('Food', '18000');
  budget('Transport', '8000');
  budget('Shopping', '15000');
  budget('Entertainment', '5000');
  budget('Health', '6000');

  // ---- Goals --------------------------------------------------------------
  const goal = (name: string, goalType: string, target: string, current: string, inDays?: number, accountId?: string) =>
    put(STORE.goal, { id: uid(), vaultId, profileId, name, goalType, targetAmount: target, currentAmount: current, targetDate: inDays ? now + inDays * DAY : null, accountId: accountId ?? null });
  goal('Retirement corpus', 'custom', '120000000', '48263910', 6570);
  goal('Home down payment', 'house', '9000000', '3840000', 580);
  // Linked: its progress is the account's balance, not a number typed here.
  goal('Emergency Fund', 'emergency_fund', '1800000', '0', undefined, EMERGENCY);
  goal('Child education', 'education', '15000000', '2260000', 3200);
  goal('Kyoto, spring', 'vacation', '450000', '186000', 240);

  // ---- Recurring ----------------------------------------------------------
  const bill = (amount: string, category: string, merchant: string, inDays: number) =>
    put(STORE.recurring, { id: uid(), vaultId, amount, type: 'expense', categoryId: cat(category), merchant, frequency: 'monthly', nextRun: now + inDays * DAY });
  bill('64820', 'EMI', 'HDFC Home Loan', 3);
  bill('649', 'Entertainment', 'Netflix', 5);
  bill('4310', 'Utilities', 'Tata Power', 9);
  bill('58000', 'Rent', 'Landlord', 11);
  put(STORE.recurring, { id: uid(), vaultId, amount: '285000', type: 'income', categoryId: cat('Salary'), merchant: 'Aurelius Systems', frequency: 'monthly', nextRun: now + 24 * DAY });

  return entries;
}

/**
 * Ninety days of net-worth history ending at today's figures, so a fresh sample
 * has trend charts. The end point comes from the loaded balances, not a constant.
 */
export function sampleSnapshots(
  ctx: Pick<SampleContext, 'vaultId' | 'now'> & { endCash: number; endInvest: number; endLiab: number },
): SampleEntry[] {
  const { vaultId, now, endCash, endInvest, endLiab } = ctx;
  const daysAgo = (n: number) => now - n * DAY;
  const entries: SampleEntry[] = [];
  const put = (type: string, value: { id: string } & Record<string, unknown>) => { entries.push({ type, value }); };
  const endNet = endCash + endInvest - endLiab;
  const startNet = endNet * 0.82;
  for (let i = 90; i >= 1; i--) {
    const t = (90 - i) / 90;
    const wobble = (rnd(`snap${i}`) - 0.5) * 0.03 + Math.sin(t * Math.PI * 3.4) * 0.018;
    const net = startNet + (endNet - startNet) * Math.pow(t, 0.95) + endNet * wobble * (1 - Math.abs(t - 0.5));
    // Scale today's mix, so cash + investments - liabilities still equals net.
    const f = net / endNet;
    const day = new Date(daysAgo(i));
    day.setHours(0, 0, 0, 0);
    put(STORE.snapshot, {
      id: `snap-sample-${day.toISOString().slice(0, 10)}`,
      vaultId,
      date: day.getTime(),
      netWorth: net.toFixed(2),
      cash: (endCash * f).toFixed(2),
      investments: (endInvest * f).toFixed(2),
      liabilities: (endLiab * f).toFixed(2),
      healthScore: Math.round(58 + t * 16 + wobble * 90),
      healthTrackedWeight: 92,
    });
  }
  return entries;
}
