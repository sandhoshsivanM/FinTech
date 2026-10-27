// The routes whose page is a re-export of a shared screen (`@khazana/screens/pages/<route>`).
// pages.test.tsx runs axe over each; routes.test.ts keeps this list equal to what app/ re-exports.
export const SHARED_ROUTES = [
  'accounts', 'add', 'alerts', 'analytics', 'budget', 'calendar', 'capture', 'dashboard', 'dividends', 'forecast',
  'goals', 'help', 'holdings', 'import', 'insurance', 'investments', 'liabilities', 'markets', 'news', 'privacy',
  'reconcile', 'recurring', 'reports', 'safety-net', 'score', 'tax', 'terms', 'transactions', 'watchlist',
] as const;
