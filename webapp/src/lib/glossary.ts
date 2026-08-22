/**
 * Plain-language definitions for the terms the app puts on screen.
 *
 * Written once, here, because the same word appears on the dashboard, the
 * holdings table and the score page, and three slightly different explanations
 * of "cost basis" is worse than none: the reader cannot tell whether the
 * difference in wording is a difference in meaning.
 *
 * House style, and it is load-bearing:
 *  - Say what the number IS before saying what it is for.
 *  - Second person, present tense, no hedging.
 *  - No term defined using another term from this file without also naming it.
 *  - One or two sentences. A definition that needs a paragraph is a sign the
 *    figure itself needs rethinking.
 */
export interface Term {
  /** The label as it appears on screen. */
  title: string;
  body: string;
}

export const GLOSSARY = {
  netWorth: {
    title: 'Net worth',
    body: 'Everything you own minus everything you owe — your cash and investments, less your loans and card balances. It is the single number that answers "where do I actually stand".',
  },
  cash: {
    title: 'Cash',
    body: 'The money sitting in the accounts you have added, after every transaction recorded against them. Not physical notes — anything you could spend today.',
  },
  investments: {
    title: 'Investments',
    body: 'What your holdings are worth right now, at the latest price the app has. This moves with the market even when you do nothing.',
  },
  invested: {
    title: 'Invested (cost basis)',
    body: 'What you actually paid for your holdings, added up. It does not change when prices move — only when you buy or sell.',
  },
  unrealisedPnl: {
    title: 'Unrealised profit & loss',
    body: 'What your holdings are worth now, minus what you paid for them. "Unrealised" means on paper: you have not sold, so nothing has been gained or lost yet and no tax is due.',
  },
  savingsRate: {
    title: 'Savings rate',
    body: 'The share of your income you did not spend this period. Saving 30% of what comes in is a common target, but the number that matters is whether it is rising.',
  },
  liabilities: {
    title: 'Liabilities',
    body: 'What you owe — loans, credit-card balances, anything with a principal outstanding. Subtracted from what you own to give net worth.',
  },
  netCashFlow: {
    title: 'Net cash flow',
    body: 'Income minus expenses over the period. Positive means more came in than went out; it says nothing about what your investments did.',
  },

  // ---- Investing ---------------------------------------------------------
  ltp: {
    title: 'LTP — last traded price',
    body: 'The price the instrument last changed hands at. It is a market price, not a valuation: between trades it simply stays where it was.',
  },
  weight: {
    title: 'Weight',
    body: 'How much of your portfolio one position accounts for, as a percentage. A holding above roughly 8% starts driving your overall return rather than riding it.',
  },
  xirr: {
    title: 'XIRR',
    body: 'Your annualised return, accounting for when each amount went in. Unlike a simple percentage gain, it does not flatter money you invested only recently.',
  },
  dayChange: {
    title: "Today's change",
    body: 'What a position gained or lost since the previous close. It needs a live price feed, so where none exists the app shows a dash rather than a guess.',
  },
  marketCap: {
    title: 'Market cap',
    body: 'The total market value of a company — large, mid or small. Larger companies tend to move less sharply; smaller ones move more in both directions.',
  },
  yieldOnPortfolio: {
    title: 'Yield on portfolio',
    body: 'Dividends received measured against what your holdings are worth today. Because the basis is current value, the figure falls when prices rise.',
  },
  diversification: {
    title: 'Diversification',
    body: 'How spread your money is across different kinds of asset. A high score means no single sort of holding decides how you do.',
  },
  concentration: {
    title: 'Concentration',
    body: 'The share of your portfolio sitting in its single largest asset group. The higher it is, the more your fortunes rest on one thing.',
  },

  // ---- Tax ---------------------------------------------------------------
  longTerm: {
    title: 'Long-term gain',
    body: 'Profit on something you have held past the threshold for its asset type. Long-term gains are usually taxed more lightly than short-term ones.',
  },
  shortTerm: {
    title: 'Short-term gain',
    body: 'Profit on something you have held for less than the threshold for its asset type. It is normally taxed at a higher rate than a long-term gain.',
  },
  slabRate: {
    title: 'Slab rate',
    body: 'Taxed as part of your income rather than at a fixed rate. The app shows "Slab" instead of a number because the rate depends on total income it does not know.',
  },

  // ---- Debt --------------------------------------------------------------
  apr: {
    title: 'APR',
    body: 'The yearly cost of borrowing, as a percentage of what you still owe. It is what the debt costs to carry for another twelve months.',
  },
  weightedApr: {
    title: 'Balance-weighted APR',
    body: 'Your average borrowing rate, weighted by how much sits at each rate. A plain average would let a tiny expensive card outweigh a large cheap home loan.',
  },
  utilisation: {
    title: 'Utilisation',
    body: 'How much of a credit limit you are using. Staying well under the limit generally reads better to a lender than repeatedly approaching it.',
  },
  avalanche: {
    title: 'Avalanche',
    body: 'Pay off the highest interest rate first. It costs the least in total interest, though the first debt can take a while to clear.',
  },
  snowball: {
    title: 'Snowball',
    body: 'Pay off the smallest balance first. It costs slightly more in interest than avalanche, but debts disappear sooner, which is easier to keep up.',
  },
  debtLoad: {
    title: 'Debt load',
    body: 'What you owe measured against what you own. It answers whether your borrowing is proportionate to your assets, not just whether it is large.',
  },

  // ---- Protection --------------------------------------------------------
  sumAssured: {
    title: 'Sum assured',
    body: 'The amount a policy pays out when it is claimed. It is the cover itself, not what you pay for it.',
  },
  termLife: {
    title: 'Term vs whole life',
    body: 'Term cover pays out only if you die within a fixed period and is cheap; whole-life cover lasts for life and costs considerably more.',
  },
  emergencyFund: {
    title: 'Emergency fund',
    body: 'Cash you could reach immediately, measured in months of your usual spending. Six months is a common target.',
  },
  coverageGap: {
    title: 'Coverage gap',
    body: 'The difference between the cover you hold and a stated guideline — commonly ten times annual income for life. It is an assumption you are free to disagree with.',
  },

  // ---- Planning ----------------------------------------------------------
  safeToSpend: {
    title: 'Safe to spend',
    body: 'What is left this month after money already committed to bills and budgets. It is what remains genuinely yours to decide about.',
  },
  goalPace: {
    title: 'Goal pace',
    body: 'Whether you are contributing fast enough to reach a goal by its date. It is a calculation from the gap and the time left, not advice.',
  },
  rollover: {
    title: 'Rollover',
    body: 'Unspent budget carried into the next month instead of being lost. A month you underspend then makes the following month a little roomier.',
  },
  budgetAdherence: {
    title: 'Budget adherence',
    body: 'How often you finish a month inside the limits you set. It measures the habit rather than any single month.',
  },
  growthAllocation: {
    title: 'Growth allocation',
    body: 'The share of your portfolio in assets that can still grow substantially, as opposed to those held mainly to preserve value.',
  },
  investedShare: {
    title: 'Invested share',
    body: 'How much of your total assets is invested rather than sitting as cash. Cash is safe but loses purchasing power to inflation.',
  },
  netWorthTrajectory: {
    title: 'Net-worth trajectory',
    body: 'Which way your net worth has moved recently. The direction matters more here than any single reading.',
  },
} as const satisfies Record<string, Term>;

export type TermKey = keyof typeof GLOSSARY;
