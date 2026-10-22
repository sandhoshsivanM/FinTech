/**
 * Decides *what* to notify and *when*, and nothing else.
 *
 * Pure + deterministic; mirrors the Flutter app's `notification_scheduler.dart`
 * exactly. No store, no Dexie, no clock of its own — just data in, data out, so
 * the whole thing is testable and the two platforms cannot drift.
 *
 * ## Why this shape
 *
 * The vault locks the moment the app is backgrounded on mobile, and after five
 * idle minutes here (`AutoLock.tsx`); the key is purged either way. So
 * *nothing running in the background can read a single record*. A notification
 * cannot be "a query that runs at 9am" — it has to be a fully-rendered string
 * handed over ahead of time, while the app is still unlocked, and fired later
 * by the OS. That is the one decision the rest of this file follows from:
 *
 *   - Callers flatten their own entities into `DueEvent` / `BudgetFact` — the
 *     scheduler never learns what a RecurringRule or an Insurance is.
 *   - Money arrives pre-formatted as text, because the currency formatter lives
 *     on the caller's side and a notification body is not a place to do maths.
 *   - The output is the *desired* set. The caller diffs it against what already
 *     exists rather than cancelling everything and rescheduling.
 *
 * ## The platform asymmetry, stated plainly
 *
 * On Android and iOS, `scheduled` is handed to AlarmManager / UNUserNotification-
 * Center and fires with the app closed. **On the web it cannot be.** The
 * Notification Triggers API was never shipped, and without a server there is no
 * push. So the web driver consumes `immediate` and `missed` and treats
 * `scheduled` as a to-do list it can only act on while a window is open. That
 * is a platform limit, not an oversight, and the alerts copy says so.
 *
 * ## Dedupe keys
 *
 *   bill:<ruleId>:<epochDay>
 *   renewal:<insuranceId>:<epochDay>:<leadDays>
 *   goal:<goalId>:<epochDay>
 *   liability:<liabilityId>:<epochDay>
 *   budget:<categoryId>:<YYYY-MM>:<thresholdPct>
 *   digest:<YYYY-MM-DD>
 *
 * ## A note on DST
 *
 * `tzOffsetMinutes` is a single offset sampled at plan time, so a reminder
 * scheduled across a DST boundary lands an hour out until the next re-plan.
 * Re-planning happens on every visibility change, and these are inexact alarms
 * on mobile anyway, so the error is inside the noise floor.
 */

/**
 * Which switch in Settings governs a notification, and which Android channel it
 * lands on. Keep the wire names stable — they are persisted in dedupe keys and
 * in the delivery log.
 */
export type NotifyCategory = 'budget' | 'bills' | 'renewals' | 'goals' | 'market' | 'digest';

export const NOTIFY_CATEGORIES: NotifyCategory[] =
  ['budget', 'bills', 'renewals', 'goals', 'market', 'digest'];

/**
 * A dated thing the user should be reminded about before it happens.
 *
 * Recurring rules, insurance renewals, goal target dates and liability due
 * dates all collapse to this. The date is known in advance and nothing
 * off-device can change it, which is why these are the one tier that genuinely
 * works with the app closed (on mobile).
 */
export interface DueEvent {
  /** The source entity's id. Half of the dedupe key, so it must be stable. */
  id: string;
  category: NotifyCategory;
  /** What to call it: "Rent", "HDFC Term Plan", "Emergency Fund". */
  label: string;
  /** Epoch ms of the event itself, not of the reminder. */
  dueAt: number;
  deepLink: string;
  /** Pre-formatted money, or null. Dropped entirely when `hideAmounts` is on. */
  amountText?: string | null;
}

/**
 * A budget already evaluated by the caller.
 *
 * `spentPct` is an integer because the comparison happens in Decimal on the
 * caller's side (`spentForCategory`) and float percentages have no business
 * crossing this boundary.
 */
export interface BudgetFact {
  categoryId: string;
  categoryName: string;
  thresholdPct: number;
  spentPct: number;
  /** `YYYY-MM`. Part of the dedupe key, so August's silence does not cover September. */
  period: string;
  amountText?: string | null;
}

/** User-facing settings. Mirrors `NotifyPrefs` in the Dart twin, field for field. */
export interface NotifyPrefs {
  /**
   * Master switch. Off by default: notification permission is something the
   * user opts into from Settings, not something a first load takes.
   */
  enabled: boolean;
  categories: NotifyCategory[];
  /** Minutes from local midnight. Wraps: 22:00–08:00 is the default. */
  quietStartMin: number;
  quietEndMin: number;
  /** Local hour reminders fire at. */
  reminderHour: number;
  billsLeadDays: number;
  renewalsLeadDays: number;
  goalsLeadDays: number;
  /** Local hour for the daily digest, or null to switch it off. */
  digestHour: number | null;
  /** How long a dedupe key stays silent after firing. */
  cooldownHours: number;
  /**
   * Keep figures out of the notification shade. Defaults to true: a notification
   * preview is the one place this app's data is visible without the PIN.
   */
  hideAmounts: boolean;
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  enabled: false,
  categories: [...NOTIFY_CATEGORIES],
  quietStartMin: 22 * 60,
  quietEndMin: 8 * 60,
  reminderHour: 9,
  billsLeadDays: 3,
  renewalsLeadDays: 14,
  goalsLeadDays: 30,
  digestHour: 20,
  cooldownHours: 24,
  hideAmounts: true,
};

/**
 * The handful of destinations the planner links to on its own. Supplied by the
 * caller because the two platforms disagree on route shape — Flutter nests
 * everything under `/app`, this app does not — and hardcoding either would make
 * the shared fixture unable to assert on both.
 */
export interface NotifyRoutes {
  budget: string;
  dashboard: string;
}

export interface PlannedNotification {
  dedupeKey: string;
  fireAt: number;
  category: NotifyCategory;
  title: string;
  body: string;
  deepLink?: string | null;
}

/** Everything the planner can see. Pure input. */
export interface NotificationPlanInput {
  now: number;
  /** Local offset from UTC in minutes (IST = 330). See the DST note above. */
  tzOffsetMinutes: number;
  routes: NotifyRoutes;
  prefs?: NotifyPrefs;
  dueEvents?: DueEvent[];
  budgets?: BudgetFact[];
  /**
   * Already-triggered market rules, rendered by `evaluateAlerts`. Fire-now only:
   * a price crossing cannot be known in advance.
   */
  marketAlerts?: PlannedNotification[];
  /** dedupeKey -> epoch ms it last fired. The cooldown reads this. */
  deliveries?: Record<string, number>;
  /**
   * iOS caps pending local notifications at 64 *per app*, silently dropping the
   * 65th. Everything else gets a sane ceiling instead.
   */
  maxPending?: number;
}

export interface NotificationPlan {
  /** Fire right now — the app is open and something just became true. */
  immediate: PlannedNotification[];
  /** The desired set of OS-scheduled notifications, soonest first. */
  scheduled: PlannedNotification[];
  /**
   * Fire times that elapsed with nothing recorded against them, i.e. what
   * happened while the app was closed. This is the whole of the web app's
   * background story, so it is not an edge case here.
   */
  missed: PlannedNotification[];
  /** How many scheduled items did not fit under `maxPending`. Surfaced, not dropped in silence. */
  truncated: number;
}

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/**
 * FNV-1a (32-bit), masked into the positive-int range.
 *
 * Deliberately not a language-provided string hash: Dart randomises those per
 * isolate, so an alarm scheduled in one run could never be cancelled in the
 * next — and there is no cross-language equivalent, which would break parity
 * outright. FNV-1a is four lines, identical in both languages, stable forever.
 * `Math.imul` is what keeps the 32-bit multiply exact.
 */
export function stableId(dedupeKey: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(dedupeKey)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash & 0x7fffffff;
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);
const floorMod = (a: number, b: number) => ((a % b) + b) % b;

/** Days since the Unix epoch, in local time. */
export const localEpochDay = (epochMs: number, tzOffsetMinutes: number): number =>
  floorDiv(epochMs + tzOffsetMinutes * MS_PER_MINUTE, MS_PER_DAY);

/** Minutes since local midnight, 0..1439. */
export const localMinuteOfDay = (epochMs: number, tzOffsetMinutes: number): number =>
  floorMod(floorDiv(epochMs + tzOffsetMinutes * MS_PER_MINUTE, MS_PER_MINUTE), 1440);

/** The inverse of the two above. */
export const localWallClock = (
  epochDay: number, minuteOfDay: number, tzOffsetMinutes: number,
): number =>
  epochDay * MS_PER_DAY + minuteOfDay * MS_PER_MINUTE - tzOffsetMinutes * MS_PER_MINUTE;

/** `YYYY-MM-DD` in local time. Used for the digest's dedupe key. */
export function localDateKey(epochMs: number, tzOffsetMinutes: number): string {
  const d = new Date(epochMs + tzOffsetMinutes * MS_PER_MINUTE);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/**
 * Whether a local minute-of-day falls inside quiet hours. Handles the wrap:
 * with 22:00–08:00, both 23:30 and 02:00 are quiet.
 */
export function inQuietHours(minuteOfDay: number, prefs: NotifyPrefs): boolean {
  const { quietStartMin: start, quietEndMin: end } = prefs;
  if (start === end) return false; // a zero-length window silences nothing
  return start < end
    ? minuteOfDay >= start && minuteOfDay < end
    : minuteOfDay >= start || minuteOfDay < end;
}

/**
 * Pushes a fire time forward to the first minute outside quiet hours.
 *
 * Forward, never backward: a reminder is allowed to arrive late, but bringing
 * it forward could fire it before the thing it is about.
 */
export function shiftOutOfQuietHours(
  fireAt: number, prefs: NotifyPrefs, tzOffsetMinutes: number,
): number {
  const minute = localMinuteOfDay(fireAt, tzOffsetMinutes);
  if (!inQuietHours(minute, prefs)) return fireAt;
  const day = localEpochDay(fireAt, tzOffsetMinutes);
  // Late-evening quiet times roll into the next morning; small-hours ones are
  // still on the same local day as the window's end.
  const rollsOver = prefs.quietStartMin > prefs.quietEndMin && minute >= prefs.quietStartMin;
  return localWallClock(day + (rollsOver ? 1 : 0), prefs.quietEndMin, tzOffsetMinutes);
}

/**
 * Whether `dedupeKey` fired recently enough to stay silent.
 *
 * This is the fix for the original Flutter `checkAndNotify()`, which re-fired on
 * every saved transaction: five grocery runs in an over-budget month produced
 * five identical notifications.
 */
export function suppressed(
  dedupeKey: string,
  deliveries: Record<string, number>,
  cooldownHours: number,
  now: number,
): boolean {
  const last = deliveries[dedupeKey];
  if (last == null) return false;
  if (cooldownHours <= 0) return false;
  return now - last < cooldownHours * 60 * MS_PER_MINUTE;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const body = (base: string, amountText: string | null | undefined, prefs: NotifyPrefs) =>
  prefs.hideAmounts || !amountText ? base : `${base} (${amountText})`;

const keyPrefix = (c: NotifyCategory): string =>
  c === 'bills' ? 'bill' : c === 'goals' ? 'goal' : c === 'renewals' ? 'renewal' : c;

const titleFor = (c: NotifyCategory, label: string): string => {
  switch (c) {
    case 'bills': return `Due soon: ${label}`;
    case 'renewals': return `Renewal due: ${label}`;
    case 'goals': return `Goal date: ${label}`;
    default: return label;
  }
};

function dueBody(e: DueEvent, inDays: number): string {
  const when = inDays <= 0 ? 'today' : inDays === 1 ? 'tomorrow' : `in ${inDays} days`;
  switch (e.category) {
    case 'bills': return `${e.label} is scheduled ${when}.`;
    case 'renewals': return `${e.label} renews ${when}.`;
    case 'goals': return `${e.label} reaches its target date ${when}.`;
    default: return `${e.label} is due ${when}.`;
  }
}

const leadDaysFor = (c: NotifyCategory, prefs: NotifyPrefs): number => {
  switch (c) {
    case 'bills': return prefs.billsLeadDays;
    case 'renewals': return prefs.renewalsLeadDays;
    case 'goals': return prefs.goalsLeadDays;
    default: return 0;
  }
};

const allows = (prefs: NotifyPrefs, c: NotifyCategory) =>
  prefs.enabled && prefs.categories.includes(c);

const EMPTY_PLAN: NotificationPlan = {
  immediate: [], scheduled: [], missed: [], truncated: 0,
};

/**
 * Turns the current state of the vault into the set of notifications that
 * should exist. Deterministic: same input, same output, always.
 */
export function planNotifications(input: NotificationPlanInput): NotificationPlan {
  const prefs = input.prefs ?? DEFAULT_NOTIFY_PREFS;
  if (!prefs.enabled) return EMPTY_PLAN;

  const now = input.now;
  const tz = input.tzOffsetMinutes;
  const dueEvents = input.dueEvents ?? [];
  const deliveries = input.deliveries ?? {};
  const maxPending = input.maxPending ?? 200;

  const immediate: PlannedNotification[] = [];
  const scheduled: PlannedNotification[] = [];
  const missed: PlannedNotification[] = [];

  // --- Budgets: true the instant a transaction is saved, so fire now. -------
  if (allows(prefs, 'budget')) {
    for (const b of input.budgets ?? []) {
      if (b.spentPct < b.thresholdPct) continue;
      const key = `budget:${b.categoryId}:${b.period}:${b.thresholdPct}`;
      if (suppressed(key, deliveries, prefs.cooldownHours, now)) continue;
      const over = b.spentPct >= 100;
      immediate.push({
        dedupeKey: key,
        fireAt: now,
        category: 'budget',
        title: over ? `Over budget: ${b.categoryName}` : `Budget alert: ${b.categoryName}`,
        body: body(
          over
            ? `You've used ${b.spentPct}% of your ${b.categoryName} budget this month.`
            : `You've used ${b.spentPct}% of your ${b.categoryName} budget, past your ${b.thresholdPct}% alert.`,
          b.amountText, prefs,
        ),
        deepLink: input.routes.budget,
      });
    }
  }

  // --- Market rules: cannot be known ahead of time, so fire-now only. -------
  if (allows(prefs, 'market')) {
    for (const m of input.marketAlerts ?? []) {
      if (suppressed(m.dedupeKey, deliveries, prefs.cooldownHours, now)) continue;
      immediate.push({ ...m, fireAt: now });
    }
  }

  // --- Dated events: the tier that works with the app closed (on mobile). ---
  for (const e of dueEvents) {
    if (!allows(prefs, e.category)) continue;

    const dueDay = localEpochDay(e.dueAt, tz);
    const lead = leadDaysFor(e.category, prefs);
    const key = e.category === 'renewals'
      ? `renewal:${e.id}:${dueDay}:${lead}`
      : `${keyPrefix(e.category)}:${e.id}:${dueDay}`;

    const raw = localWallClock(dueDay - lead, prefs.reminderHour * 60, tz);
    const fireAt = shiftOutOfQuietHours(raw, prefs, tz);

    // Relative to when it *fires*, not to now. "in 3 days" written today for a
    // reminder that goes off tomorrow would be wrong by the time anyone read it,
    // and stale text is the main failure mode of scheduling ahead.
    const inDays = dueDay - localEpochDay(fireAt, tz);
    const n: PlannedNotification = {
      dedupeKey: key,
      fireAt,
      category: e.category,
      title: titleFor(e.category, e.label),
      body: body(dueBody(e, inDays), e.amountText, prefs),
      deepLink: e.deepLink,
    };

    if (fireAt > now) {
      scheduled.push(n);
    } else if (!(key in deliveries) && e.dueAt >= now) {
      // Its moment passed with nothing recorded against it, and the thing it is
      // about has not happened yet — so it is still worth saying, and here this
      // is the only way it ever gets said.
      missed.push(n);
    }
  }

  // --- The daily digest, one instance, re-planned on every pass. ------------
  if (prefs.digestHour != null && allows(prefs, 'digest')) {
    const today = localEpochDay(now, tz);
    let at = localWallClock(today, prefs.digestHour * 60, tz);
    if (at <= now) at = localWallClock(today + 1, prefs.digestHour * 60, tz);
    at = shiftOutOfQuietHours(at, prefs, tz);

    const horizon = at + MS_PER_DAY;
    // Only counts what the user actually asked to hear about. Counting a
    // switched-off category would make the digest advertise reminders that
    // deliberately never arrive.
    const upcoming = dueEvents.filter(
      (e) => allows(prefs, e.category) && e.dueAt >= now && e.dueAt <= horizon,
    ).length;
    if (upcoming > 0) {
      const key = `digest:${localDateKey(at, tz)}`;
      if (!suppressed(key, deliveries, prefs.cooldownHours, now)) {
        scheduled.push({
          dedupeKey: key,
          fireAt: at,
          category: 'digest',
          title: `Khazana: ${upcoming} ${plural(upcoming, 'thing', 'things')} coming up`,
          // Deliberately retrospective. This text was written when the app was
          // last open, and by the time it fires it may be a day stale.
          body: `As of your last visit, ${upcoming} ${plural(upcoming, 'item was', 'items were')} `
            + 'due within a day. Open Khazana for the current picture.',
          deepLink: input.routes.dashboard,
        });
      }
    }
  }

  // Soonest first, then trim to the platform's ceiling. Sorting before the cut
  // is what makes the cut safe: what falls off is always the furthest away, and
  // the next pass will pick it up.
  // Every sort tie-breaks on the dedupe key. Dart's List.sort is unstable and
  // JavaScript's is stable, so two items sharing a fire time would come out in
  // different orders on the two platforms — and the truncation below turns an
  // ordering difference into a *behaviour* difference.
  const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const byFireAt = (a: PlannedNotification, b: PlannedNotification) =>
    a.fireAt - b.fireAt || byKey(a.dedupeKey, b.dedupeKey);

  scheduled.sort(byFireAt);
  const truncated = Math.max(0, scheduled.length - maxPending);

  immediate.sort((a, b) => byKey(a.dedupeKey, b.dedupeKey));
  missed.sort(byFireAt);

  return {
    immediate,
    scheduled: truncated > 0 ? scheduled.slice(0, maxPending) : scheduled,
    missed,
    truncated,
  };
}
