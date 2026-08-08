import {
  LayoutDashboard, LineChart, BarChart3, TrendingUp, Table2, Star, CandlestickChart,
  Coins, Landmark, Wallet, Receipt, CalendarDays, PieChart, Repeat, Flag, CreditCard,
  Shield, LifeBuoy, Gauge, Newspaper, Bell, Settings, HelpCircle,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Rendered as a count pill on the right of the row. */
  badge?: number;
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
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/analytics', label: 'Analytics', icon: LineChart },
      { href: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Invest',
    items: [
      { href: '/investments', label: 'Portfolio', icon: TrendingUp },
      { href: '/holdings', label: 'Holdings', icon: Table2 },
      { href: '/watchlist', label: 'Watchlist', icon: Star },
      { href: '/markets', label: 'Markets', icon: CandlestickChart },
      { href: '/dividends', label: 'Dividends', icon: Coins },
      { href: '/tax', label: 'Tax Center', icon: Landmark },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/accounts', label: 'Accounts', icon: Wallet },
      { href: '/transactions', label: 'Transactions', icon: Receipt },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays },
      { href: '/budget', label: 'Budget', icon: PieChart },
      { href: '/recurring', label: 'Recurring', icon: Repeat },
      { href: '/goals', label: 'Goals', icon: Flag },
    ],
  },
  {
    label: 'Protect',
    items: [
      { href: '/liabilities', label: 'Liabilities', icon: CreditCard },
      { href: '/insurance', label: 'Insurance', icon: Shield },
      { href: '/safety-net', label: 'Safety Net', icon: LifeBuoy },
      { href: '/score', label: 'Score', icon: Gauge },
    ],
  },
  {
    label: 'More',
    items: [
      { href: '/news', label: 'News', icon: Newspaper },
      { href: '/alerts', label: 'Alerts', icon: Bell },
      { href: '/settings', label: 'Settings', icon: Settings },
      { href: '/help', label: 'Help', icon: HelpCircle },
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
