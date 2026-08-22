import {
  LayoutDashboard, LineChart, BarChart3, TrendingUp, Table2, Star, CandlestickChart,
  Coins, Landmark, Wallet, Receipt, CalendarDays, CalendarClock, PieChart, Repeat, Flag, CreditCard,
  Shield, ShieldCheck, LifeBuoy, Gauge, Newspaper, Bell, Settings, HelpCircle, Upload, Stethoscope, Scale,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Rendered as a count pill on the right of the row. */
  badge?: number;
  /**
   * Part of Khazana Pro. Renders a small lock chip when not unlocked.
   *
   * The row still navigates: the screen itself renders `ProGate`, which
   * shows the real content blurred behind the paywall card. Hiding gated
   * rows entirely would make the sidebar change shape on purchase, and
   * would stop anyone discovering what they are being sold.
   *
   * Source of truth is `docs/pro-gates.json`; this flag is only the visual
   * hint, and `specParity.test.tsx` asserts the two agree.
   */
  pro?: boolean;
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
 * it is one of the five Flutter bottom-bar tabs and renaming it would break
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
      { href: '/forecast', label: 'Forecast', icon: CalendarClock, description: 'Where this is heading', pro: true },
      { href: '/analytics', label: 'Analytics', icon: LineChart, description: 'Deeper cuts of the same data', pro: true },
    ],
  },
  {
    label: 'Invest',
    items: [
      // These two are the pair most often confused, and the labels alone do not
      // separate them: one is the summary, the other is the table it summarises.
      { href: '/investments', label: 'Portfolio', icon: TrendingUp, description: 'Allocation, returns, performance' },
      { href: '/holdings', label: 'Holdings', icon: Table2, description: 'Every position, one row each' },
      { href: '/watchlist', label: 'Watchlist', icon: Star, description: 'Things you do not own yet', pro: true },
      { href: '/markets', label: 'Markets', icon: CandlestickChart, description: 'Index levels and sessions', pro: true },
      { href: '/dividends', label: 'Dividends', icon: Coins, description: 'Income your holdings paid out', pro: true },
      { href: '/tax', label: 'Tax Centre', icon: Landmark, description: 'Gains, and what they may cost', pro: true },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/accounts', label: 'Accounts', icon: Wallet, description: 'Where your money sits' },
      { href: '/transactions', label: 'Transactions', icon: Receipt, description: 'Everything in and out' },
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
      { href: '/reconcile', label: 'Reconcile', icon: Scale, description: 'Check the app against your bank', pro: true },
      { href: '/alerts', label: 'Alerts', icon: Bell, description: 'What the app wants to tell you' },
      { href: '/diagnostics', label: 'Diagnostics', icon: Stethoscope, description: 'Health of the vault itself' },
      { href: '/news', label: 'News', icon: Newspaper, description: 'Headlines for what you hold', pro: true },
      { href: '/pro', label: 'Khazana Pro', icon: Sparkles, description: 'One payment, yours forever' },
      { href: '/settings', label: 'Settings', icon: Settings, description: 'Appearance, profiles, backup' },
      { href: '/help', label: 'Help', icon: HelpCircle, description: 'How this works, and the tour' },
      { href: '/privacy', label: 'Privacy', icon: ShieldCheck, description: 'What leaves your device, and what does not' },
    ],
  },
];

/** Flat view, for anything that does not care about grouping. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * The five phone destinations, matching the Flutter app's tab bar exactly.
 * `Shell.test.tsx` asserts the two lists stay in step — a user moving between
 * clients should not have to relearn where things are.
 */
export const BOTTOM_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/transactions', label: 'Cash Flow', icon: Receipt },
  { href: '/investments', label: 'Investments', icon: TrendingUp },
  { href: '/score', label: 'Score', icon: Gauge },
  { href: '/settings', label: 'Settings', icon: Settings },
];

/** Page titles for the mobile topbar. Longest prefix wins. */
export const TITLES: Record<string, string> = {
  ...Object.fromEntries(NAV_ITEMS.map((n) => [n.href, n.label])),
  '/add': 'Add Transaction',
};

/** True when `href` is the active destination for `path`. */
export function isActive(href: string, path: string): boolean {
  return path === href || (href !== '/dashboard' && path.startsWith(href));
}
