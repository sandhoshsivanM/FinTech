import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/features/investments/services/sip_reminders.dart';
import 'package:khazana_domain/entities/holding.dart';
import 'package:khazana_domain/entities/sip.dart';
import 'package:khazana_domain/services/notification_scheduler.dart';

void main() {
  final plan = SipPlan(
    id: 's1',
    vaultId: 'v1',
    instrumentId: 'i1',
    name: 'HDFC Flexi Cap',
    assetType: AssetType.equityMf,
    amount: Decimal.parse('10000'),
    dayOfMonth: 25,
    startDate: const CalendarDate(2026, 1, 25),
  );
  final now = DateTime(2026, 11, 23, 10);

  List<PlannedNotification> plan0({
    List<SipPlan>? plans,
    List<SipInstalment> inst = const [],
    NotifyPrefs prefs = const NotifyPrefs(enabled: true),
  }) =>
      planSipReminders(
        plans: plans ?? [plan],
        instalments: inst,
        prefs: prefs,
        now: now,
        deepLink: '/app/investments/sips',
      );

  test('one reminder on the due date at the digest hour, keyed per date', () {
    final out = plan0();
    expect(out.map((n) => n.dedupeKey), ['sip:s1:2026-11-25']);
    final at = DateTime.fromMillisecondsSinceEpoch(out.single.fireAt);
    expect([at.year, at.month, at.day, at.hour], [2026, 11, 25, 20]);
    expect(out.single.title, 'SIP due: HDFC Flexi Cap');
    expect(out.single.deepLink, '/app/investments/sips');
    expect(out.single.category, NotifyCategory.bills);
  });

  test('amounts stay out of the body while hideAmounts is on', () {
    expect(plan0().single.body, isNot(contains('10,000')));
    expect(plan0(prefs: const NotifyPrefs(enabled: true, hideAmounts: false)).single.body,
        contains('10,000'));
  });

  test('an answered date, a paused plan and remind-off are all silent', () {
    expect(
        plan0(inst: [
          SipInstalment(
              id: 'n',
              sipId: 's1',
              dueDate: const CalendarDate(2026, 11, 25),
              status: SipInstalmentStatus.skipped,
              amount: Decimal.zero),
        ]),
        isEmpty);
    expect(plan0(plans: [plan.copyWith(active: false)]), isEmpty);
    expect(plan0(plans: [plan.copyWith(remind: false)]), isEmpty);
  });

  test('switching Bills off silences SIP reminders', () {
    expect(
        plan0(prefs: const NotifyPrefs(enabled: true).copyWith(categories: {
          NotifyCategory.digest,
        })),
        isEmpty);
  });
}
