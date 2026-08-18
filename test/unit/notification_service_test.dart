// The delivery layer's one piece of real logic: reconcile's diff.
//
// Worth a test of its own because the failure it prevents is invisible. The
// obvious implementation — cancelAll() then reschedule everything — passes any
// end-state assertion you write, while churning every alarm on every app open
// and, on iOS, quietly pushing reminders past the 64-pending cap. Only the call
// sequence shows the difference, so that is what this asserts.

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/services/notification_service.dart';
import 'package:khazana/domain/services/notification_scheduler.dart';
import 'package:mocktail/mocktail.dart';
import 'package:timezone/timezone.dart' as tz;

class _MockPlugin extends Mock implements FlutterLocalNotificationsPlugin {}

class _FakeNotificationDetails extends Fake implements NotificationDetails {}

class _FakeInitializationSettings extends Fake
    implements InitializationSettings {}

class _FakeTZDateTime extends Fake implements tz.TZDateTime {}

PlannedNotification _n(String key, {int fireAt = 1_000_000_000_000}) =>
    PlannedNotification(
      dedupeKey: key,
      fireAt: fireAt,
      category: NotifyCategory.bills,
      title: 'T',
      body: 'B',
      deepLink: '/app/recurring',
    );

PendingNotificationRequest _pending(int id) =>
    PendingNotificationRequest(id, 'T', 'B', null);

void main() {
  setUpAll(() {
    registerFallbackValue(_FakeNotificationDetails());
    registerFallbackValue(_FakeInitializationSettings());
    registerFallbackValue(_FakeTZDateTime());
    registerFallbackValue(AndroidScheduleMode.inexactAllowWhileIdle);
  });

  late _MockPlugin plugin;
  late NotificationService service;

  setUp(() {
    plugin = _MockPlugin();
    service = NotificationService(plugin);

    // init() reaches for platform channels that do not exist under `flutter
    // test`; it swallows the failure by design, and everything below only needs
    // the plugin calls to be recorded.
    when(() => plugin.initialize(any(),
        onDidReceiveNotificationResponse: any(
            named: 'onDidReceiveNotificationResponse'))).thenAnswer((_) async => true);
    when(() => plugin.getNotificationAppLaunchDetails())
        .thenAnswer((_) async => null);
    when(() => plugin.cancel(any())).thenAnswer((_) async {});
    when(() => plugin.cancelAll()).thenAnswer((_) async {});
    when(() => plugin.show(any(), any(), any(), any(),
        payload: any(named: 'payload'))).thenAnswer((_) async {});
    when(() => plugin.zonedSchedule(any(), any(), any(), any(), any(),
        androidScheduleMode: any(named: 'androidScheduleMode'),
        payload: any(named: 'payload'),
        matchDateTimeComponents:
            any(named: 'matchDateTimeComponents'))).thenAnswer((_) async {});
  });

  void pendingIs(List<int> ids) {
    when(() => plugin.pendingNotificationRequests())
        .thenAnswer((_) async => ids.map(_pending).toList());
  }

  group('reconcile', () {
    test('schedules only what the OS is not already holding', () async {
      final keep = _n('bill:a:1');
      final add = _n('bill:b:2');
      pendingIs([keep.id]);

      final r = await service.reconcile([keep, add]);

      expect(r, (added: 1, removed: 0, kept: 1));
      verify(() => plugin.zonedSchedule(add.id, any(), any(), any(), any(),
          androidScheduleMode: any(named: 'androidScheduleMode'),
          payload: any(named: 'payload'),
          matchDateTimeComponents:
              any(named: 'matchDateTimeComponents'))).called(1);
      // The whole point: an unchanged reminder is left exactly as it is.
      verifyNever(() => plugin.zonedSchedule(keep.id, any(), any(), any(), any(),
          androidScheduleMode: any(named: 'androidScheduleMode'),
          payload: any(named: 'payload'),
          matchDateTimeComponents: any(named: 'matchDateTimeComponents')));
      verifyNever(() => plugin.cancel(any()));
      verifyNever(() => plugin.cancelAll());
    });

    test('cancels what is no longer wanted', () async {
      final keep = _n('bill:a:1');
      pendingIs([keep.id, 424242]);

      final r = await service.reconcile([keep]);

      expect(r, (added: 0, removed: 1, kept: 1));
      verify(() => plugin.cancel(424242)).called(1);
      verifyNever(() => plugin.cancel(keep.id));
    });

    test('an empty desired set cancels everything individually, never cancelAll',
        () async {
      // cancelAll would also wipe alarms belonging to a different vault, which
      // this service has no way to distinguish and no business dropping.
      pendingIs([1, 2, 3]);

      final r = await service.reconcile(const []);

      expect(r, (added: 0, removed: 3, kept: 0));
      verifyNever(() => plugin.cancelAll());
    });

    test('is idempotent — a second pass with the same plan does nothing',
        () async {
      final plan = [_n('bill:a:1'), _n('bill:b:2')];
      pendingIs(plan.map((n) => n.id).toList());

      final r = await service.reconcile(plan);

      expect(r, (added: 0, removed: 0, kept: 2));
      verifyNever(() => plugin.cancel(any()));
      verifyNever(() => plugin.zonedSchedule(any(), any(), any(), any(), any(),
          androidScheduleMode: any(named: 'androidScheduleMode'),
          payload: any(named: 'payload'),
          matchDateTimeComponents: any(named: 'matchDateTimeComponents')));
    });

    test('schedules with inexact alarms and carries the deep link', () async {
      // Exact alarms need SCHEDULE_EXACT_ALARM (not auto-granted since Android
      // 14) or USE_EXACT_ALARM (Play-restricted to alarm/calendar apps). If this
      // ever flips to an exact mode, the app stops being publishable.
      final n = _n('bill:a:1');
      pendingIs([]);

      await service.reconcile([n]);

      final captured = verify(() => plugin.zonedSchedule(
              n.id, 'T', 'B', any(), any(),
              androidScheduleMode: captureAny(named: 'androidScheduleMode'),
              payload: captureAny(named: 'payload'),
              matchDateTimeComponents: any(named: 'matchDateTimeComponents')))
          .captured;
      expect(captured[0], AndroidScheduleMode.inexactAllowWhileIdle);
      expect(captured[1], '/app/recurring');
    });
  });

  group('showFrom', () {
    test('posts under the dedupe key\'s stable id, with the payload', () async {
      final n = _n('budget:c-food:2026-08:90');
      await service.showFrom(n);
      verify(() => plugin.show(
          stableId('budget:c-food:2026-08:90'), 'T', 'B', any(),
          payload: '/app/recurring')).called(1);
    });

    test('a failure to post does not escape', () async {
      // Best-effort by design: a notification is never worth taking the app down
      // for, and on a denied permission the platform throws.
      when(() => plugin.show(any(), any(), any(), any(),
          payload: any(named: 'payload'))).thenThrow(Exception('denied'));
      await expectLater(service.showFrom(_n('bill:a:1')), completes);
    });
  });
}
