/**
 * Which bell items the user has already seen.
 *
 * The bell's list is derived, not stored: it is recomputed from the vault on
 * every render (bills due this week, renewals this month, alerts whose rule
 * holds). Without a record of what was seen, the same items — and the red dot —
 * came back on every visit until the bill was paid or the date passed.
 *
 * Each item carries an *occurrence key* that changes only when the thing itself
 * changes (a bill's next due date moves on, a policy's renewal date changes), so
 * an unchanged item stays read and a new occurrence is new again. Only these
 * opaque keys are stored, never titles or amounts.
 */
const STORAGE_KEY = 'kz.notifications.seen';

export function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Marks `current` as seen and forgets keys no longer in the list, so storage
 * holds at most what the bell is showing rather than growing forever.
 */
export function markSeen(current: readonly string[]): Set<string> {
  const next = new Set(current);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // Storage blocked (private window): items simply show as new next visit.
  }
  return next;
}

export function unreadCount(current: readonly string[], seen: ReadonlySet<string>): number {
  return current.reduce((n, k) => (seen.has(k) ? n : n + 1), 0);
}
