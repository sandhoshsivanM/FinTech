import 'package:khazana_domain/entities/sip.dart';
import 'package:khazana_domain/services/notification_scheduler.dart';
import 'package:khazana_domain/services/sip_schedule.dart';

import '../../../core/utils/money_format.dart';

/// How far ahead SIP reminders are handed to the OS. Reconcile runs on every
/// unlock and resume, so a month is plenty and keeps well inside the iOS
/// 64-pending cap.
const kSipReminderHorizonDays = 31;

/// SIP reminders: one on each due date, at the evening digest hour (or the
/// reminder hour when the digest is off), under the Bills switch.
///
/// Kept beside the shared planner rather than inside it: the planner is a twin
/// of `notificationScheduler.ts` pinned by a shared fixture, and a SIP reminder
/// is a plain dated event that needs none of its machinery.
///
/// Dedupe key `sip:<sipId>:<YYYY-MM-DD>`. An answered due date is not
/// reminded, so Mark done today cancels tonight's reminder on the next
/// reconcile.
List<PlannedNotification> planSipReminders({
  required List<SipPlan> plans,
  required List<SipInstalment> instalments,
  required NotifyPrefs prefs,
  required DateTime now,
  required String deepLink,
}) {
  if (!prefs.allows(NotifyCategory.bills)) return const [];
  final tz = now.timeZoneOffset.inMinutes;
  final nowMs = now.millisecondsSinceEpoch;
  final today = CalendarDate.of(now);
  final hour = prefs.digestHour ?? prefs.reminderHour;
  final out = <PlannedNotification>[];

  for (final p in plans) {
    if (!p.active || !p.remind) continue;
    final answered = {
      for (final i in instalments)
        if (i.sipId == p.id) i.dueDate,
    };
    for (final d in occurrences(
      p,
      today,
      today.addDays(kSipReminderHorizonDays),
    )) {
      if (answered.contains(d)) continue;
      final epochDay =
          DateTime.utc(d.year, d.month, d.day).millisecondsSinceEpoch ~/
          Duration.millisecondsPerDay;
      final fireAt = shiftOutOfQuietHours(
        localWallClock(epochDay, hour * 60, tz),
        prefs,
        tz,
      );
      if (fireAt <= nowMs) continue;
      final amount = Money.whole(amountOn(p, d));
      out.add(
        PlannedNotification(
          dedupeKey: 'sip:${p.id}:${d.iso}',
          fireAt: fireAt,
          category: NotifyCategory.bills,
          title: 'SIP due: ${p.name}',
          body: prefs.hideAmounts
              ? 'Tap Mark done once it is paid to record the units.'
              : '$amount today. Tap Mark done once it is paid to record the units.',
          deepLink: deepLink,
        ),
      );
    }
  }
  return out;
}
