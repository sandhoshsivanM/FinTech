/** A fresh record id. */
export const uid = () => crypto.randomUUID();

/**
 * Deterministic id of a profile's Cash account. Shared by both apps' stores and
 * by screens that default a new entry to Cash, so they cannot drift apart.
 */
export const cashAcctId = (profileId: string) => `acct-cash-${profileId}`;

/** Categories a new vault starts with. */
export const DEFAULT_CATEGORIES: { name: string; icon: string }[] = [
  { name: 'Food', icon: 'Utensils' },
  { name: 'Transport', icon: 'Bus' },
  { name: 'Rent', icon: 'Home' },
  { name: 'Utilities', icon: 'Zap' },
  { name: 'Shopping', icon: 'ShoppingBag' },
  { name: 'Health', icon: 'HeartPulse' },
  { name: 'Entertainment', icon: 'Clapperboard' },
  { name: 'EMI', icon: 'Landmark' },
  { name: 'Salary', icon: 'Wallet' },
  { name: 'Investment', icon: 'TrendingUp' },
  { name: 'Other', icon: 'Shapes' },
];
