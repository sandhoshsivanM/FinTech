/**
 * Notification settings, mirroring `NotifyPrefsNotifier` in the Flutter app.
 *
 * localStorage rather than the encrypted vault, for the same reason the theme
 * and currency live there: these are device preferences, not records. Which
 * device you want reminders on is a fact about the device, and a vault synced
 * to a second machine should not drag the first machine's notification settings
 * along with it.
 */
import { DEFAULT_NOTIFY_PREFS, NOTIFY_CATEGORIES, type NotifyCategory, type NotifyPrefs } from '@/domain/notificationScheduler';
import { lsGet, lsSet } from './store';

export const NOTIFY_PREFS_KEY = 'khazana-notify-prefs';

const isCategory = (v: unknown): v is NotifyCategory =>
  typeof v === 'string' && (NOTIFY_CATEGORIES as string[]).includes(v);

/**
 * Reads the saved settings, falling back field by field.
 *
 * Tolerant on purpose: a preference written by a newer build, or half-written
 * when a tab was closed mid-save, must not cost the user every setting they
 * have — and must never throw on a path that runs during render.
 */
export function loadNotifyPrefs(): NotifyPrefs {
  const raw = lsGet(NOTIFY_PREFS_KEY);
  if (!raw) return DEFAULT_NOTIFY_PREFS;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return DEFAULT_NOTIFY_PREFS;
  }
  if (!parsed || typeof parsed !== 'object') return DEFAULT_NOTIFY_PREFS;

  const num = (k: keyof NotifyPrefs, fallback: number) =>
    typeof parsed[k] === 'number' && Number.isFinite(parsed[k]) ? (parsed[k] as number) : fallback;
  const bool = (k: keyof NotifyPrefs, fallback: boolean) =>
    typeof parsed[k] === 'boolean' ? (parsed[k] as boolean) : fallback;

  return {
    enabled: bool('enabled', DEFAULT_NOTIFY_PREFS.enabled),
    categories: Array.isArray(parsed.categories)
      ? parsed.categories.filter(isCategory)
      : DEFAULT_NOTIFY_PREFS.categories,
    quietStartMin: num('quietStartMin', DEFAULT_NOTIFY_PREFS.quietStartMin),
    quietEndMin: num('quietEndMin', DEFAULT_NOTIFY_PREFS.quietEndMin),
    reminderHour: num('reminderHour', DEFAULT_NOTIFY_PREFS.reminderHour),
    billsLeadDays: num('billsLeadDays', DEFAULT_NOTIFY_PREFS.billsLeadDays),
    renewalsLeadDays: num('renewalsLeadDays', DEFAULT_NOTIFY_PREFS.renewalsLeadDays),
    goalsLeadDays: num('goalsLeadDays', DEFAULT_NOTIFY_PREFS.goalsLeadDays),
    digestHour:
      'digestHour' in parsed
        ? (typeof parsed.digestHour === 'number' ? parsed.digestHour : null)
        : DEFAULT_NOTIFY_PREFS.digestHour,
    cooldownHours: num('cooldownHours', DEFAULT_NOTIFY_PREFS.cooldownHours),
    hideAmounts: bool('hideAmounts', DEFAULT_NOTIFY_PREFS.hideAmounts),
  };
}

export const NOTIFY_PREFS_EVENT = 'khazana:notify-prefs';

export function saveNotifyPrefs(prefs: NotifyPrefs): void {
  lsSet(NOTIFY_PREFS_KEY, JSON.stringify(prefs));
  cached = prefs;
  // Same-tab listeners: the storage event only fires in *other* tabs, so
  // without this the settings screen would update and the driver would not.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOTIFY_PREFS_EVENT));
  }
}

// --- useSyncExternalStore adapter -------------------------------------------
//
// localStorage is not readable during the static export's prerender, and
// reading it in an effect and calling setState causes a cascading render. This
// is the shape React provides for exactly that: a server snapshot for the
// prerender and hydration, then the real one.
//
// The cache matters. getSnapshot must return a referentially stable value or
// React re-renders forever, and loadNotifyPrefs() builds a fresh object each
// call — so the parsed result is held until something invalidates it.
let cached: NotifyPrefs | null = null;

export function subscribeNotifyPrefs(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => { cached = null; onChange(); };
  window.addEventListener(NOTIFY_PREFS_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(NOTIFY_PREFS_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function getNotifyPrefsSnapshot(): NotifyPrefs {
  cached ??= loadNotifyPrefs();
  return cached;
}

/** The prerender and the first hydration pass both see the defaults. */
export const getNotifyPrefsServerSnapshot = (): NotifyPrefs => DEFAULT_NOTIFY_PREFS;

/**
 * The delivery log: dedupeKey -> when it last fired.
 *
 * Also localStorage, and deliberately so. Its whole job is to survive a reload
 * — a cooldown held only in memory would let every budget alert fire again on
 * the next visit, which is the bug this exists to prevent. It holds keys and
 * timestamps, never message text, so nothing legible about the user's finances
 * is written outside the encrypted store.
 */
export const DELIVERY_LOG_KEY = 'khazana-notify-log';

/** Entries older than this are dropped; no cooldown is longer than a few days. */
const LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function loadDeliveryLog(now: number = Date.now()): Record<string, number> {
  const raw = lsGet(DELIVERY_LOG_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      if (now - v > LOG_TTL_MS) continue; // prune, or this grows forever
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function recordDeliveries(keys: string[], at: number): Record<string, number> {
  const log = loadDeliveryLog(at);
  for (const k of keys) log[k] = at;
  lsSet(DELIVERY_LOG_KEY, JSON.stringify(log));
  return log;
}
