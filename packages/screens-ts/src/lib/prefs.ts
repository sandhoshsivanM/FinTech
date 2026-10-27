/**
 * Screen preferences kept in localStorage (the last account picked in the add
 * form, for one). Never vault data: that goes through the injected store.
 */
export const LAST_ACCOUNT_KEY = 'khazana-last-account';

/** Reads a preference. Safe when localStorage is absent. */
export function lsGet(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(key);
}

/** Writes a preference. Safe when localStorage is absent or full. */
export function lsSet(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key, value); } catch { /* quota or private mode */ }
}
