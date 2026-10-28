import { WalletCards } from 'lucide-react';
import { NAV_GROUPS, TITLES, type NavGroup } from '@khazana/screens/components/navConfig';

/**
 * The shared sidebar with Online's differences: Cards joins Money (credit cards
 * are an Online-only screen), and Diagnostics is left out (it inspects the
 * offline vault, which Online does not have).
 */
export const ONLINE_NAV_GROUPS: NavGroup[] = NAV_GROUPS.map((g) => {
  if (g.label === 'Money') {
    const items = [...g.items];
    const at = items.findIndex((i) => i.href === '/accounts') + 1;
    items.splice(at, 0, { href: '/cards', label: 'Cards', icon: WalletCards, description: 'Credit cards, dues and limits' });
    return { ...g, items };
  }
  return {
    ...g,
    items: g.items
      .filter((i) => i.href !== '/diagnostics')
      .map((i) => (i.href === '/settings' ? { ...i, description: 'Appearance, profiles, devices' } : i)),
  };
});

export const ONLINE_TITLES: Record<string, string> = {
  ...TITLES,
  '/cards': 'Cards',
  '/settings': 'Settings',
  '/link': 'Link bank & investments',
};
