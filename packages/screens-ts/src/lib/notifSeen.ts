/**
 * Which bell items the user has already seen.
 *
 * The bell's list is derived, not stored: it is recomputed from the records on
 * every render (bills due this week, renewals this month, alerts whose rule
 * holds). Without a record of what was seen, the same items — and the red dot —
 * came back on every visit until the bill was paid or the date passed.
 *
 * Each item carries an *occurrence key* that changes only when the thing itself
 * changes (a bill's next due date moves on, a policy's renewal date changes), so
 * an unchanged item stays read and a new occurrence is new again. Only these
 * opaque keys are stored, never titles or amounts.
 */
import { lsGet, lsSet } from './prefs';

const STORAGE_KEY = 'kz.notifications.seen';

export function loadSeen(): Set<string> {
  try {
    const raw = lsGet(STORAGE_KEY);
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
  // Storage blocked (private window): items simply show as new next visit.
  lsSet(STORAGE_KEY, JSON.stringify([...next]));
  return next;
}

/**
 * Marks one item as seen — the one the user opened — keeping the others
 * unread. Keys no longer listed are forgotten, as in [markSeen].
 */
export function markOneSeen(key: string, current: readonly string[], seen: ReadonlySet<string>): Set<string> {
  const keep = new Set(current);
  return markSeen([...seen, key].filter((k) => keep.has(k)));
}

export function unreadCount(current: readonly string[], seen: ReadonlySet<string>): number {
  return current.reduce((n, k) => (seen.has(k) ? n : n + 1), 0);
}
