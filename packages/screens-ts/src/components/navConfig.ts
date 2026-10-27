import {
  LayoutDashboard, LineChart, BarChart3, TrendingUp, Table2, Star, CandlestickChart,
  Coins, Landmark, Wallet, Receipt, CalendarDays, CalendarClock, PieChart, Repeat, Flag, CreditCard,
  Shield, ShieldCheck, LifeBuoy, Gauge, Newspaper, Bell, Settings, HelpCircle, Upload, Stethoscope, Scale, Inbox,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the phone bottom bar, where a tab is ~60px wide. */
  short?: string;
  icon: LucideIcon;
  /** Rendered as a count pill on the right of the row. */
  badge?: number;
  /**
   * One line under the label, on the expanded sidebar only.
   *
   * Twenty-five one-word labels tell a returning user where to click and a new
   * one nothing at all — "Portfolio", "Holdings", "Accounts" and "Transactions"
   * are four different screens whose names do not distinguish them. Kept to a
   * few words: this is a signpost, not documentation.
   */
  description?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * The complete route index, grouped.
 *
 * Grouping is not decoration: the sidebar carries every route the app serves
 * (guarded by `Shell.test.tsx`), and at twenty-plus destinations a flat list
 * stops being scannable. The five groups answer "what am I trying to do" —
 * look at it, grow it, spend it, protect it, everything else.
 *
 * `/investments` is the Portfolio screen. The route keeps its old path because
 * it is one of the four Flutter bottom-bar tabs and renaming it would break
 * cross-client parity; only the label moved.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Where you stand today' },
      // "Score" named the mechanism, not the thing. A user does not come
      // looking for a score; they come asking whether they are doing all right.
      { href: '/score', label: 'Financial Health', icon: Gauge, description: 'Your score and the four areas behind it' },
      { href: '/reports', label: 'Reports', icon: BarChart3, description: 'Trends over time' },
      { href: '/forecast', label: 'Forecast', icon: CalendarClock, description: 'Where this is heading' },
      { href: '/analytics', label: 'Analytics', icon: LineChart, description: 'Deeper cuts of the same data' },
    ],
  },
  {
    label: 'Invest',
    items: [
      // These two are the pair most often confused, and the labels alone do not
      // separate them: one is the summary, the other is the table it summarises.
      { href: '/investments', label: 'Portfolio', icon: TrendingUp, description: 'Allocation, returns, performance' },
      { href: '/holdings', label: 'Holdings', icon: Table2, description: 'Every position, one row each' },
      { href: '/watchlist', label: 'Watchlist', icon: Star, description: 'Things you do not own yet' },
      { href: '/markets', label: 'Markets', icon: CandlestickChart, description: 'Index levels and sessions' },
      { href: '/dividends', label: 'Dividends', icon: Coins, description: 'Income your holdings paid out' },
      { href: '/tax', label: 'Tax centre', icon: Landmark, description: 'Gains, and what they may cost' },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/accounts', label: 'Accounts', icon: Wallet, description: 'Where your money sits' },
      { href: '/transactions', label: 'Transactions', icon: Receipt, description: 'Everything in and out' },
      { href: '/capture', label: 'Review', icon: Inbox, description: 'Bank SMS waiting for a yes or no' },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays, description: 'The same money, by date' },
      { href: '/budget', label: 'Budget', icon: PieChart, description: 'Limits per category' },
      { href: '/recurring', label: 'Recurring', icon: Repeat, description: 'Bills and income that repeat' },
      { href: '/goals', label: 'Goals', icon: Flag, description: 'What you are saving towards' },
    ],
  },
  {
    label: 'Protect',
    items: [
      { href: '/liabilities', label: 'Liabilities', icon: CreditCard, description: 'Loans and card balances' },
      { href: '/insurance', label: 'Insurance', icon: Shield, description: 'Policies and cover gaps' },
      { href: '/safety-net', label: 'Safety Net', icon: LifeBuoy, description: 'How long you could hold out' },
    ],
  },
  {
    // Things you operate the vault WITH, rather than things you look at.
    // Reconcile and Import were sitting in the middle of the money list, where
    // they read as another financial screen instead of as a tool.
    label: 'Tools',
    items: [
      { href: '/import', label: 'Import', icon: Upload, description: 'Bring in a statement or broker file' },
      { href: '/reconcile', label: 'Reconcile', icon: Scale, description: 'Check the app against your bank' },
      { href: '/alerts', label: 'Alerts', icon: Bell, description: 'What the app wants to tell you' },
      { href: '/diagnostics', label: 'Diagnostics', icon: Stethoscope, description: 'Health of the vault itself' },
      { href: '/news', label: 'News', icon: Newspaper, description: 'Headlines for what you hold' },
      { href: '/settings', label: 'Settings', icon: Settings, description: 'Appearance, profiles, backup' },
      { href: '/help', label: 'Help', icon: HelpCircle, description: 'How this works, and the tour' },
      { href: '/privacy', label: 'Privacy', icon: ShieldCheck, description: 'What leaves your device, and what does not' },
    ],
  },
];

/** Flat view, for anything that does not care about grouping. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * The four phone destinations, matching the Flutter app's tab bar exactly.
 * Settings is reached from the profile menu and the drawer, as on Flutter.
 * `Shell.test.tsx` asserts the two lists stay in step — a user moving between
 * clients should not have to relearn where things are.
 */
export const BOTTOM_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/transactions', label: 'Cash Flow', icon: Receipt },
  { href: '/investments', label: 'Investments', short: 'Invest', icon: TrendingUp },
  { href: '/score', label: 'Score', icon: Gauge },
];

/** Page titles for the mobile topbar. Longest prefix wins. */
export const TITLES: Record<string, string> = {
  ...Object.fromEntries(NAV_ITEMS.map((n) => [n.href, n.label])),
  '/add': 'Add Transaction',
};

/** True when `href` is the active destination for `path`. */
export function isActive(href: string, path: string): boolean {
  // The static export uses `trailingSlash: true`, so the live path is
  // `/dashboard/` — strip it or the home tab is never marked active.
  const p = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return p === href || (href !== '/dashboard' && p.startsWith(href));
}
