// Decides *what* to notify and *when*, and nothing else.
//
// Pure + deterministic; mirrors the web app's `notificationScheduler.ts`
// exactly. No Flutter, no Drift, no plugin, no clock of its own — just data in,
// data out, so the whole thing is testable and the two platforms cannot drift.
//
// ## Why this shape
//
// The vault locks the moment the app is backgrounded (`app_shell.dart`) and the
// SQLCipher key is purged, so *nothing running in the background can read a
// single row*. A notification therefore cannot be "a query that runs at 9am".
// It has to be a fully-rendered string handed to the OS ahead of time, while
// the app is still unlocked, and fired later by AlarmManager / UNUserNotification-
// Center. That is the one decision the rest of this file follows from:
//
//   * Callers flatten their own entities into [DueEvent] / [BudgetFact] — the
//     scheduler never learns what a RecurringRule or an Insurance is.
//   * Money arrives pre-formatted as text, because the currency formatter lives
//     on the caller's side and a notification body is not a place to do maths.
//   * The output is the *desired* set. The caller diffs it against what the OS
//     already holds (`NotificationService.reconcile`) rather than cancelling
//     everything and rescheduling, which would churn hundreds of alarms per app
//     open and silently blow the iOS 64-pending cap.
//
// ## Dedupe keys
//
// Every notification carries a stable key, and [stableId] turns it into the
// integer id the OS indexes on. Same key, same id, forever — that is what lets
// a reschedule replace an alarm instead of duplicating it, and what stops the
// bug where saving five expenses against an over-budget category fired five
// identical alerts.
//
//   bill:<ruleId>:<epochDay>
//   renewal:<insuranceId>:<epochDay>:<leadDays>
//   goal:<goalId>:<epochDay>
//   liability:<liabilityId>:<epochDay>
//   budget:<categoryId>:<YYYY-MM>:<thresholdPct>
//   digest:<YYYY-MM-DD>
//
// ## A note on DST
//
// [NotificationPlanInput.tzOffsetMinutes] is a single offset sampled at plan
// time, so a reminder scheduled across a DST boundary lands an hour out until
// the next reconcile. Reconcile runs on every resume, and these are inexact
// alarms that may drift ~40 minutes anyway, so the error is already inside the
// noise floor. Anything tighter would mean shipping a tz database into a pure
// function.

import 'dart:convert' show utf8;

/// Which switch in Settings governs a notification, and which Android channel
/// it lands on. Keep the wire names stable — they are persisted in dedupe keys
/// and in the delivery log.
enum NotifyCategory {
  budget('budget'),
  bills('bills'),
  renewals('renewals'),
  goals('goals'),
  market('market'),
  digest('digest');

  const NotifyCategory(this.key);
  final String key;

  static NotifyCategory fromKey(String k) =>
      NotifyCategory.values.firstWhere((c) => c.key == k,
          orElse: () => NotifyCategory.digest);
}

/// A dated thing the user should be reminded about before it happens.
///
/// Recurring rules, insurance renewals, goal target dates and liability due
/// dates all collapse to this. The date is known in advance and nothing
/// off-device can change it, which is exactly why these can be handed to the OS
/// and fire with the app closed.
class DueEvent {
  const DueEvent({
    required this.id,
    required this.category,
    required this.label,
    required this.dueAt,
    required this.deepLink,
    this.amountText,
  });

  /// The source entity's id. Half of the dedupe key, so it must be stable.
  final String id;
  final NotifyCategory category;

  /// What to call it: "Rent", "HDFC Term Plan", "Emergency Fund".
  final String label;

  /// Epoch ms of the event itself, not of the reminder.
  final int dueAt;
  final String deepLink;

  /// Pre-formatted money, or null. Dropped entirely when
  /// [NotifyPrefs.hideAmounts] is on — see [_body].
  final String? amountText;
}

/// A budget already evaluated by the caller.
///
/// [spentPct] is an integer because the comparison happens in Decimal on the
/// caller's side ([BudgetCalculator.isAtAlertThreshold] / `spentForCategory`)
/// and float percentages have no business crossing this boundary.
class BudgetFact {
  const BudgetFact({
    required this.categoryId,
    required this.categoryName,
    required this.thresholdPct,
    required this.spentPct,
    required this.period,
    this.amountText,
  });

  final String categoryId;
  final String categoryName;
  final int thresholdPct;
  final int spentPct;

  /// `YYYY-MM`. Part of the dedupe key, so an alert silenced in August is free
  /// to fire again in September.
  final String period;
  final String? amountText;
}

/// User-facing settings. One shape, mirrored in `notifyPrefs.ts` and persisted
/// as JSON under `notification_prefs_v1`.
class NotifyPrefs {
  const NotifyPrefs({
    this.enabled = false,
    this.categories = const {
      NotifyCategory.budget,
      NotifyCategory.bills,
      NotifyCategory.renewals,
      NotifyCategory.goals,
      NotifyCategory.market,
      NotifyCategory.digest,
    },
    this.quietStartMin = 22 * 60,
    this.quietEndMin = 8 * 60,
    this.reminderHour = 9,
    this.billsLeadDays = 3,
    this.renewalsLeadDays = 14,
    this.goalsLeadDays = 30,
    this.digestHour = 20,
    this.cooldownHours = 24,
    this.hideAmounts = true,
  });

  /// Master switch. Off by default: notification permission is something the
  /// user opts into from Settings, not something a first launch takes.
  final bool enabled;
  final Set<NotifyCategory> categories;

  /// Minutes from local midnight. Wraps: 22:00–08:00 is the default.
  final int quietStartMin;
  final int quietEndMin;

  /// Local hour reminders fire at.
  final int reminderHour;

  final int billsLeadDays;
  final int renewalsLeadDays;
  final int goalsLeadDays;

  /// Local hour for the daily digest, or null to switch it off.
  final int? digestHour;

  /// How long a dedupe key stays silent after firing.
  final int cooldownHours;

  /// Keep figures out of the notification shade. Defaults to true: the lock
  /// screen is the one place this app's data is visible without the PIN.
  final bool hideAmounts;

  bool allows(NotifyCategory c) => enabled && categories.contains(c);

  int leadDaysFor(NotifyCategory c) => switch (c) {
        NotifyCategory.bills => billsLeadDays,
        NotifyCategory.renewals => renewalsLeadDays,
        NotifyCategory.goals => goalsLeadDays,
        _ => 0,
      };

  NotifyPrefs copyWith({
    bool? enabled,
    Set<NotifyCategory>? categories,
    int? quietStartMin,
    int? quietEndMin,
    int? reminderHour,
    int? billsLeadDays,
    int? renewalsLeadDays,
    int? goalsLeadDays,
    Object? digestHour = _unset,
    int? cooldownHours,
    bool? hideAmounts,
  }) =>
      NotifyPrefs(
        enabled: enabled ?? this.enabled,
        categories: categories ?? this.categories,
        quietStartMin: quietStartMin ?? this.quietStartMin,
        quietEndMin: quietEndMin ?? this.quietEndMin,
        reminderHour: reminderHour ?? this.reminderHour,
        billsLeadDays: billsLeadDays ?? this.billsLeadDays,
        renewalsLeadDays: renewalsLeadDays ?? this.renewalsLeadDays,
        goalsLeadDays: goalsLeadDays ?? this.goalsLeadDays,
        digestHour:
            identical(digestHour, _unset) ? this.digestHour : digestHour as int?,
        cooldownHours: cooldownHours ?? this.cooldownHours,
        hideAmounts: hideAmounts ?? this.hideAmounts,
      );

  Map<String, dynamic> toJson() => {
        'enabled': enabled,
        'categories': [for (final c in NotifyCategory.values) if (categories.contains(c)) c.key],
        'quietStartMin': quietStartMin,
        'quietEndMin': quietEndMin,
        'reminderHour': reminderHour,
        'billsLeadDays': billsLeadDays,
        'renewalsLeadDays': renewalsLeadDays,
        'goalsLeadDays': goalsLeadDays,
        'digestHour': digestHour,
        'cooldownHours': cooldownHours,
        'hideAmounts': hideAmounts,
      };

  /// Tolerant by design: an unreadable or half-written preference must never
  /// stop the app, it just falls back to the default for that field.
  factory NotifyPrefs.fromJson(Map<String, dynamic> j) {
    const d = NotifyPrefs();
    int i(String k, int fallback) => j[k] is int ? j[k] as int : fallback;
    return NotifyPrefs(
      enabled: j['enabled'] is bool ? j['enabled'] as bool : d.enabled,
      categories: j['categories'] is List
          ? {
              for (final k in (j['categories'] as List).whereType<String>())
                NotifyCategory.fromKey(k),
            }
          : d.categories,
      quietStartMin: i('quietStartMin', d.quietStartMin),
      quietEndMin: i('quietEndMin', d.quietEndMin),
      reminderHour: i('reminderHour', d.reminderHour),
      billsLeadDays: i('billsLeadDays', d.billsLeadDays),
      renewalsLeadDays: i('renewalsLeadDays', d.renewalsLeadDays),
      goalsLeadDays: i('goalsLeadDays', d.goalsLeadDays),
      digestHour: j.containsKey('digestHour')
          ? (j['digestHour'] is int ? j['digestHour'] as int : null)
          : d.digestHour,
      cooldownHours: i('cooldownHours', d.cooldownHours),
      hideAmounts:
          j['hideAmounts'] is bool ? j['hideAmounts'] as bool : d.hideAmounts,
    );
  }
}

const Object _unset = Object();

/// The handful of destinations the planner links to on its own. Supplied by the
/// caller because the two platforms disagree on route shape — Flutter nests
/// everything under `/app`, the web app does not — and hardcoding either would
/// make the shared fixture unable to assert on both.
class NotifyRoutes {
  const NotifyRoutes({required this.budget, required this.dashboard});
  final String budget;
  final String dashboard;
}

/// Everything the planner can see. Pure input.
class NotificationPlanInput {
  const NotificationPlanInput({
    required this.now,
    required this.tzOffsetMinutes,
    required this.routes,
    this.prefs = const NotifyPrefs(),
    this.dueEvents = const [],
    this.budgets = const [],
    this.marketAlerts = const [],
    this.deliveries = const {},
    this.maxPending = 200,
  });

  final NotifyRoutes routes;

  final int now;

  /// Local offset from UTC in minutes (IST = 330). See the DST note above.
  final int tzOffsetMinutes;
  final NotifyPrefs prefs;
  final List<DueEvent> dueEvents;
  final List<BudgetFact> budgets;

  /// Already-triggered market rules, rendered by the caller's alert evaluator.
  /// These are fire-now only: a price crossing cannot be known in advance.
  final List<PlannedNotification> marketAlerts;

  /// dedupeKey -> epoch ms it last fired. The cooldown reads this.
  final Map<String, int> deliveries;

  /// iOS caps pending local notifications at 64 *per app*, silently dropping
  /// the 65th. Everything else gets a sane ceiling instead.
  final int maxPending;
}

class PlannedNotification {
  const PlannedNotification({
    required this.dedupeKey,
    required this.fireAt,
    required this.category,
    required this.title,
    required this.body,
    this.deepLink,
  });

  final String dedupeKey;
  final int fireAt;
  final NotifyCategory category;
  final String title;
  final String body;
  final String? deepLink;

  /// The OS-facing id. Derived, never stored — see [stableId].
  int get id => stableId(dedupeKey);

  PlannedNotification copyWith({int? fireAt}) => PlannedNotification(
        dedupeKey: dedupeKey,
        fireAt: fireAt ?? this.fireAt,
        category: category,
        title: title,
        body: body,
        deepLink: deepLink,
      );

  @override
  String toString() =>
      'PlannedNotification($dedupeKey @ $fireAt: $title / $body)';
}

class NotificationPlan {
  const NotificationPlan({
    this.immediate = const [],
    this.scheduled = const [],
    this.missed = const [],
    this.truncated = 0,
  });

  /// Fire right now — the app is open and something just became true.
  final List<PlannedNotification> immediate;

  /// The desired set of OS-scheduled notifications, soonest first.
  final List<PlannedNotification> scheduled;

  /// Fire times that elapsed with nothing recorded against them, i.e. what
  /// happened while the app was closed. Feeds the "while you were away" digest
  /// on web, which has no OS scheduler to fall back on.
  final List<PlannedNotification> missed;

  /// How many scheduled items did not fit under [NotificationPlanInput
  /// .maxPending]. Surfaced in the UI rather than dropped in silence.
  final int truncated;

  bool get isEmpty =>
      immediate.isEmpty && scheduled.isEmpty && missed.isEmpty;
}

const int _msPerMinute = 60 * 1000;
const int _msPerDay = 24 * 60 * _msPerMinute;

/// FNV-1a (32-bit), masked into Dart's positive-int range.
///
/// Deliberately not `String.hashCode`: Dart randomises string hashes per
/// isolate on some platforms, so an alarm scheduled in one run could never be
/// cancelled in the next — and there is no TypeScript equivalent, which would
/// break parity outright. FNV-1a is four lines, identical in both languages,
/// and stable forever.
int stableId(String dedupeKey) {
  var hash = 0x811c9dc5;
  for (final byte in utf8.encode(dedupeKey)) {
    hash ^= byte;
    hash = (hash * 0x01000193) & 0xFFFFFFFF;
  }
  return hash & 0x7FFFFFFF;
}

/// Days since the Unix epoch, in local time.
int localEpochDay(int epochMs, int tzOffsetMinutes) =>
    _floorDiv(epochMs + tzOffsetMinutes * _msPerMinute, _msPerDay);

/// Minutes since local midnight, 0..1439.
int localMinuteOfDay(int epochMs, int tzOffsetMinutes) =>
    _floorMod(_floorDiv(epochMs + tzOffsetMinutes * _msPerMinute, _msPerMinute), 1440);

/// The inverse of the two above.
int localWallClock(int epochDay, int minuteOfDay, int tzOffsetMinutes) =>
    epochDay * _msPerDay +
    minuteOfDay * _msPerMinute -
    tzOffsetMinutes * _msPerMinute;

/// `YYYY-MM-DD` in local time. Used for the digest's dedupe key.
String localDateKey(int epochMs, int tzOffsetMinutes) {
  final d = DateTime.fromMillisecondsSinceEpoch(
      epochMs + tzOffsetMinutes * _msPerMinute,
      isUtc: true);
  return '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

int _floorDiv(int a, int b) => (a - _floorMod(a, b)) ~/ b;
int _floorMod(int a, int b) => ((a % b) + b) % b;

/// Whether a local minute-of-day falls inside quiet hours. Handles the wrap:
/// with 22:00–08:00, both 23:30 and 02:00 are quiet.
bool inQuietHours(int minuteOfDay, NotifyPrefs prefs) {
  final start = prefs.quietStartMin;
  final end = prefs.quietEndMin;
  if (start == end) return false; // a zero-length window silences nothing
  return start < end
      ? minuteOfDay >= start && minuteOfDay < end
      : minuteOfDay >= start || minuteOfDay < end;
}

/// Pushes a fire time forward to the first minute outside quiet hours.
///
/// Forward, never backward: a reminder is allowed to arrive late, but bringing
/// it forward could fire it before the thing it is about.
int shiftOutOfQuietHours(int fireAt, NotifyPrefs prefs, int tzOffsetMinutes) {
  final minute = localMinuteOfDay(fireAt, tzOffsetMinutes);
  if (!inQuietHours(minute, prefs)) return fireAt;
  final day = localEpochDay(fireAt, tzOffsetMinutes);
  // Late-evening quiet times roll into the next morning; small-hours ones are
  // still on the same local day as the window's end.
  final rollsOver = prefs.quietStartMin > prefs.quietEndMin &&
      minute >= prefs.quietStartMin;
  return localWallClock(
      day + (rollsOver ? 1 : 0), prefs.quietEndMin, tzOffsetMinutes);
}

/// Whether [dedupeKey] fired recently enough to stay silent.
///
/// This is the fix for the original `checkAndNotify()`, which re-fired on every
/// saved transaction: five grocery runs in an over-budget month produced five
/// identical notifications.
bool suppressed(
  String dedupeKey,
  Map<String, int> deliveries,
  int cooldownHours,
  int now,
) {
  final last = deliveries[dedupeKey];
  if (last == null) return false;
  if (cooldownHours <= 0) return false;
  return now - last < cooldownHours * 60 * _msPerMinute;
}

String _plural(int n, String one, String many) => n == 1 ? one : many;

String _body(String base, String? amountText, NotifyPrefs prefs) =>
    (prefs.hideAmounts || amountText == null || amountText.isEmpty)
        ? base
        : '$base ($amountText)';

/// Turns the current state of the vault into the set of notifications that
/// should exist. Deterministic: same input, same output, always.
NotificationPlan planNotifications(NotificationPlanInput input) {
  final prefs = input.prefs;
  if (!prefs.enabled) return const NotificationPlan();

  final immediate = <PlannedNotification>[];
  final scheduled = <PlannedNotification>[];
  final missed = <PlannedNotification>[];

  // --- Budgets: true the instant a transaction is saved, so fire now. -------
  if (prefs.allows(NotifyCategory.budget)) {
    for (final b in input.budgets) {
      if (b.spentPct < b.thresholdPct) continue;
      final key = 'budget:${b.categoryId}:${b.period}:${b.thresholdPct}';
      if (suppressed(key, input.deliveries, prefs.cooldownHours, input.now)) {
        continue;
      }
      final over = b.spentPct >= 100;
      immediate.add(PlannedNotification(
        dedupeKey: key,
        fireAt: input.now,
        category: NotifyCategory.budget,
        title: over
            ? 'Over budget: ${b.categoryName}'
            : 'Budget alert: ${b.categoryName}',
        body: _body(
          over
              ? "You've used ${b.spentPct}% of your ${b.categoryName} budget this month."
              : "You've used ${b.spentPct}% of your ${b.categoryName} budget, past your ${b.thresholdPct}% alert.",
          b.amountText,
          prefs,
        ),
        deepLink: input.routes.budget,
      ));
    }
  }

  // --- Market rules: cannot be known ahead of time, so fire-now only. -------
  if (prefs.allows(NotifyCategory.market)) {
    for (final m in input.marketAlerts) {
      if (suppressed(
          m.dedupeKey, input.deliveries, prefs.cooldownHours, input.now)) {
        continue;
      }
      immediate.add(m.copyWith(fireAt: input.now));
    }
  }

  // --- Dated events: the part that genuinely works with the app closed. -----
  for (final e in input.dueEvents) {
    if (!prefs.allows(e.category)) continue;

    final dueDay = localEpochDay(e.dueAt, input.tzOffsetMinutes);
    final lead = prefs.leadDaysFor(e.category);
    final key = e.category == NotifyCategory.renewals
        ? 'renewal:${e.id}:$dueDay:$lead'
        : '${_keyPrefix(e.category)}:${e.id}:$dueDay';

    final raw = localWallClock(
        dueDay - lead, prefs.reminderHour * 60, input.tzOffsetMinutes);
    final fireAt = shiftOutOfQuietHours(raw, prefs, input.tzOffsetMinutes);

    // Relative to when it *fires*, not to now. "in 3 days" written today for a
    // reminder that goes off tomorrow would be wrong by the time anyone read it,
    // and stale text is the main failure mode of scheduling ahead.
    final inDays = dueDay - localEpochDay(fireAt, input.tzOffsetMinutes);
    final n = PlannedNotification(
      dedupeKey: key,
      fireAt: fireAt,
      category: e.category,
      title: _title(e.category, e.label),
      body: _body(_dueBody(e, inDays), e.amountText, prefs),
      deepLink: e.deepLink,
    );

    if (fireAt > input.now) {
      scheduled.add(n);
    } else if (!input.deliveries.containsKey(key) && e.dueAt >= input.now) {
      // Its moment passed with nothing recorded against it, and the thing it is
      // about has not happened yet — so it is still worth saying, and on web
      // this is the only way it ever gets said.
      missed.add(n);
    }
  }

  // --- The daily digest, one instance, re-planned on every reconcile. -------
  if (prefs.digestHour != null && prefs.allows(NotifyCategory.digest)) {
    final today = localEpochDay(input.now, input.tzOffsetMinutes);
    var at = localWallClock(
        today, prefs.digestHour! * 60, input.tzOffsetMinutes);
    if (at <= input.now) {
      at = localWallClock(
          today + 1, prefs.digestHour! * 60, input.tzOffsetMinutes);
    }
    at = shiftOutOfQuietHours(at, prefs, input.tzOffsetMinutes);

    final horizon = at + _msPerDay;
    // Only counts what the user actually asked to hear about. Counting a
    // switched-off category would make the digest advertise reminders that
    // deliberately never arrive.
    final upcoming = input.dueEvents
        .where((e) =>
            prefs.allows(e.category) && e.dueAt >= input.now && e.dueAt <= horizon)
        .length;
    if (upcoming > 0) {
      final key = 'digest:${localDateKey(at, input.tzOffsetMinutes)}';
      if (!suppressed(key, input.deliveries, prefs.cooldownHours, input.now)) {
        scheduled.add(PlannedNotification(
          dedupeKey: key,
          fireAt: at,
          category: NotifyCategory.digest,
          title: 'Khazana: $upcoming ${_plural(upcoming, 'thing', 'things')} coming up',
          // Deliberately retrospective. This text was written when the app was
          // last open, and by the time it fires it may be a day stale.
          body: 'As of your last visit, $upcoming '
              '${_plural(upcoming, 'item was', 'items were')} due within a day. '
              'Open Khazana for the current picture.',
          deepLink: input.routes.dashboard,
        ));
      }
    }
  }

  // Soonest first, then trim to the platform's ceiling. Sorting before the cut
  // is what makes the cut safe: what falls off is always the furthest away, and
  // the next reconcile will pick it up.
  // Every sort tie-breaks on the dedupe key. Dart's List.sort is unstable and
  // JavaScript's is stable, so two items sharing a fire time would come out in
  // different orders on the two platforms — and the truncation below turns an
  // ordering difference into a *behaviour* difference.
  scheduled.sort(_byFireAt);
  final truncated =
      scheduled.length > input.maxPending ? scheduled.length - input.maxPending : 0;

  immediate.sort((a, b) => a.dedupeKey.compareTo(b.dedupeKey));
  missed.sort(_byFireAt);

  return NotificationPlan(
    immediate: List.unmodifiable(immediate),
    scheduled: List.unmodifiable(
        truncated > 0 ? scheduled.sublist(0, input.maxPending) : scheduled),
    missed: List.unmodifiable(missed),
    truncated: truncated,
  );
}

int _byFireAt(PlannedNotification a, PlannedNotification b) {
  final t = a.fireAt.compareTo(b.fireAt);
  return t != 0 ? t : a.dedupeKey.compareTo(b.dedupeKey);
}

String _keyPrefix(NotifyCategory c) => switch (c) {
      NotifyCategory.bills => 'bill',
      NotifyCategory.goals => 'goal',
      NotifyCategory.renewals => 'renewal',
      NotifyCategory.budget => 'budget',
      NotifyCategory.market => 'market',
      NotifyCategory.digest => 'digest',
    };

String _title(NotifyCategory c, String label) => switch (c) {
      NotifyCategory.bills => 'Due soon: $label',
      NotifyCategory.renewals => 'Renewal due: $label',
      NotifyCategory.goals => 'Goal date: $label',
      _ => label,
    };

String _dueBody(DueEvent e, int inDays) {
  final when = inDays <= 0
      ? 'today'
      : inDays == 1
          ? 'tomorrow'
          : 'in $inDays days';
  return switch (e.category) {
    NotifyCategory.bills => '${e.label} is scheduled $when.',
    NotifyCategory.renewals => '${e.label} renews $when.',
    NotifyCategory.goals => '${e.label} reaches its target date $when.',
    _ => '${e.label} is due $when.',
  };
}
