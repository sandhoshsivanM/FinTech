import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:khazana/core/services/notification_service.dart';
import 'package:khazana/domain/services/notification_scheduler.dart';

/// Device-only: exercises the REAL `flutter_local_notifications` plugin against
/// the platform scheduler — AlarmManager on Android, UNUserNotificationCenter on
/// Apple.
///
/// This is the layer no unit test can reach. `test/unit/notification_service_test.dart`
/// asserts against a mocktail double, so it proves the *diff* is right and
/// nothing about whether the OS accepted anything. Everything the feature
/// promises — that a reminder survives the app being closed — lives on the far
/// side of that boundary.
///
/// Run with:
///   flutter test integration_test/notification_delivery_test.dart
///
/// Android needs the runtime permission first (API 33+), or every schedule is a
/// silent no-op:
///   adb shell pm grant com.khazana.app android.permission.POST_NOTIFICATIONS
///
/// **What this file cannot prove, so that nobody reads it as proof.**
/// `pendingNotificationRequests()` returns the plugin's own persisted list
/// (`shared_prefs/scheduled_notifications.xml`), not AlarmManager's. So these
/// tests establish that the plugin accepted and recorded a schedule and that the
/// diff in [NotificationService.reconcile] is right — not that the OS will
/// deliver anything. Worse, `flutter test` uninstalls the app when the run ends,
/// which takes every alarm with it, so no test in this file can outlive itself.
///
/// Delivery was verified separately and by hand, on an API 34 emulator, by
/// installing a build persistently and reading the platform's own state:
///
///   dumpsys alarm →
///     RTC_WAKEUP Alarm{... com.khazana.app}
///     tag=*walarm*:com.khazana.app/com.dexterous.flutterlocalnotifications
///                 .ScheduledNotificationReceiver
///
/// A reminder armed before `adb reboot` was re-registered by
/// `ScheduledNotificationBootReceiver` on boot and delivered ~1 min after its
/// inexact target, with the app never reopened. If that ever needs redoing,
/// those two observations — the walarm tag and a post-reboot delivery — are the
/// evidence to look for.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late NotificationService service;

  /// Well clear of now, so nothing under test fires mid-run and removes itself
  /// from the pending set while we are counting it.
  int inHours(int h) =>
      DateTime.now().add(Duration(hours: h)).millisecondsSinceEpoch;

  PlannedNotification bill(String id, {int hours = 24}) => PlannedNotification(
        dedupeKey: 'bill:$id:integration',
        fireAt: inHours(hours),
        category: NotifyCategory.bills,
        title: 'Due soon: $id',
        body: '$id is scheduled tomorrow.',
        deepLink: '/app/transactions',
      );

  setUp(() async {
    service = NotificationService();
    await service.init();
    // Each test owns the whole pending set; leftovers from a previous one would
    // make the diff assertions meaningless.
    await service.cancelAll();
  });

  tearDown(() async => service.cancelAll());

  testWidgets('init succeeds and the OS reports a permission state',
      (tester) async {
    // Null is a legitimate answer on platforms that will not say, but it must
    // not throw — init() swallowing an exception would leave every later call a
    // silent no-op.
    await service.hasPermission();
    expect(await service.pending(), isEmpty);
  });

  testWidgets('a scheduled reminder is accepted and recorded intact',
      (tester) async {
    final n = bill('rent');
    await service.schedule(n);

    final pending = await service.pending();
    expect(pending.map((p) => p.id), contains(n.id),
        reason: 'zonedSchedule was rejected outright — the plugin did not even '
            'record it, so the OS was never asked');

    final held = pending.firstWhere((p) => p.id == n.id);
    expect(held.title, n.title);
    expect(held.body, n.body);
    // The payload is what routes the tap. Losing it here means every tap lands
    // on the dashboard regardless of what the notification was about.
    expect(held.payload, '/app/transactions');
  });

  testWidgets('the id is derived from the dedupe key, so it can be cancelled',
      (tester) async {
    final n = bill('electricity');
    await service.schedule(n);
    expect((await service.pending()).map((p) => p.id), contains(n.id));

    // Recomputed from the key rather than remembered — this is exactly what
    // reconcile does on a later launch, when the object is long gone.
    await service.cancel(stableId('bill:electricity:integration'));
    expect((await service.pending()).map((p) => p.id), isNot(contains(n.id)));
  });

  testWidgets('reconcile adds what is new and cancels what is gone',
      (tester) async {
    final a = bill('a');
    final b = bill('b', hours: 48);
    final c = bill('c', hours: 72);

    var r = await service.reconcile([a, b]);
    expect(r.added, 2);
    expect(r.removed, 0);
    expect((await service.pending()).length, 2);

    // b survives, a goes, c arrives.
    r = await service.reconcile([b, c]);
    expect(r.added, 1, reason: 'c should have been scheduled');
    expect(r.removed, 1, reason: 'a should have been cancelled');
    expect(r.kept, 1, reason: 'b was already correct and must be left alone');

    final ids = (await service.pending()).map((p) => p.id).toSet();
    expect(ids, containsAll([b.id, c.id]));
    expect(ids, isNot(contains(a.id)));
  });

  testWidgets('reconciling the same set twice changes nothing', (tester) async {
    // The regression that matters for battery: rebuilding every alarm on every
    // app open. A no-op reconcile must be a genuine no-op.
    final set = [bill('x'), bill('y', hours: 30), bill('z', hours: 40)];

    await service.reconcile(set);
    final r = await service.reconcile(set);

    expect(r.added, 0);
    expect(r.removed, 0);
    expect(r.kept, 3);
    expect((await service.pending()).length, 3);
  });

  testWidgets('an empty desired set clears everything', (tester) async {
    await service.reconcile([bill('one'), bill('two', hours: 26)]);
    expect((await service.pending()), isNotEmpty);

    final r = await service.reconcile(const []);
    expect(r.removed, 2);
    expect(await service.pending(), isEmpty);
  });

  testWidgets('the planner and the scheduler agree end to end', (tester) async {
    // Closes the loop: plan from vault-shaped data, hand the result straight to
    // the OS, and read back what the OS is holding. A mismatch here means the
    // two halves disagree even though each passes its own tests.
    final now = DateTime.now();
    final plan = planNotifications(NotificationPlanInput(
      now: now.millisecondsSinceEpoch,
      tzOffsetMinutes: now.timeZoneOffset.inMinutes,
      routes: const NotifyRoutes(budget: '/app/budget', dashboard: '/app/dashboard'),
      prefs: const NotifyPrefs(enabled: true, billsLeadDays: 0, digestHour: null),
      dueEvents: [
        DueEvent(
          id: 'r-integration',
          category: NotifyCategory.bills,
          label: 'Rent',
          // Far enough out that the reminder is still in the future even after
          // quiet hours push it to the next morning.
          dueAt: now.add(const Duration(days: 5)).millisecondsSinceEpoch,
          deepLink: '/app/transactions',
        ),
      ],
    ));

    expect(plan.scheduled, isNotEmpty, reason: 'the planner produced nothing');

    await service.reconcile(plan.scheduled);
    final ids = (await service.pending()).map((p) => p.id).toSet();
    for (final n in plan.scheduled) {
      expect(ids, contains(n.id), reason: '${n.dedupeKey} never reached the OS');
    }
  });
}
