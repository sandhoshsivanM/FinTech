import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../../domain/services/notification_scheduler.dart';

/// Delivery. What to say and when is [planNotifications]' job; this file only
/// carries it to the OS.
///
/// Local-only (PRD §2: no server push) — and for everything except a live price
/// crossing, local is not a compromise. `zonedSchedule` registers the reminder
/// with Android's AlarmManager / iOS's UNUserNotificationCenter, which fire it
/// whether or not this app is running. The vault is locked and the SQLCipher key
/// purged by then, which is exactly why the text is rendered in advance rather
/// than looked up at fire time.
///
/// Best-effort throughout: a notification that fails to post must never take the
/// app down with it.
class NotificationService {
  NotificationService([FlutterLocalNotificationsPlugin? plugin])
      : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  bool _initialized = false;

  /// Set when the user taps a notification, and consumed by the router *after*
  /// the vault is unlocked. A tap on a cold start lands on the unlock screen, so
  /// without somewhere to park the destination every tap would end on the
  /// dashboard regardless of what it was about.
  final ValueNotifier<String?> pendingDeepLink = ValueNotifier<String?>(null);

  /// Android channel ids. **Immutable once created** — Android keeps whatever
  /// importance and sound the user set against the id, and renaming one throws
  /// that away and starts a second, silent channel. `budget_alerts` predates the
  /// scheduler and keeps its original id for that reason.
  static const _channels = <NotifyCategory, ({String id, String name, String description, Importance importance})>{
    NotifyCategory.budget: (
      id: 'budget_alerts',
      name: 'Budget Alerts',
      description: 'Alerts when a category nears its budget limit',
      importance: Importance.high,
    ),
    NotifyCategory.bills: (
      id: 'bills_due',
      name: 'Bills & Recurring',
      description: 'Reminders before a scheduled transaction is due',
      importance: Importance.high,
    ),
    NotifyCategory.renewals: (
      id: 'renewals',
      name: 'Renewals',
      description: 'Reminders before an insurance policy renews',
      importance: Importance.defaultImportance,
    ),
    NotifyCategory.goals: (
      id: 'goals',
      name: 'Goals',
      description: 'Reminders as a savings goal reaches its target date',
      importance: Importance.defaultImportance,
    ),
    NotifyCategory.market: (
      id: 'market_alerts',
      name: 'Market Alerts',
      description: 'Price and portfolio-weight rules, checked while the app is open',
      importance: Importance.defaultImportance,
    ),
    NotifyCategory.digest: (
      id: 'digest',
      name: 'Daily Digest',
      description: 'One evening summary of what is coming up',
      importance: Importance.low,
    ),
  };

  /// Prepares the plugin and the timezone database. Deliberately does **not**
  /// ask for permission — see [requestPermission].
  ///
  /// Safe to call before the vault is unlocked; it touches no user data.
  Future<void> init({void Function(String route)? onDeepLink}) async {
    if (_initialized) return;
    try {
      tzdata.initializeTimeZones();
      try {
        tz.setLocalLocation(tz.getLocation(await FlutterTimezone.getLocalTimezone()));
      } on Object catch (e) {
        // Falls back to UTC. Reminders land at the wrong hour, which is bad, but
        // an unknown zone name must not cost the user every reminder they have.
        debugPrint('NotificationService: local timezone unavailable ($e), using UTC');
      }

      const settings = InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        // All three false: a permission dialog on the very first frame, before
        // anything has been explained, is how an app gets permanently denied.
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
        macOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      );

      await _plugin.initialize(
        settings,
        onDidReceiveNotificationResponse: (response) {
          final route = response.payload;
          if (route == null || route.isEmpty) return;
          pendingDeepLink.value = route;
          onDeepLink?.call(route);
        },
      );

      // A tap that launched the app from cold does not arrive through the
      // callback above — it is waiting here instead.
      final launch = await _plugin.getNotificationAppLaunchDetails();
      final payload = launch?.notificationResponse?.payload;
      if (launch?.didNotificationLaunchApp == true &&
          payload != null &&
          payload.isNotEmpty) {
        pendingDeepLink.value = payload;
      }

      await _createChannels();
      _initialized = true;
    } on Object catch (e) {
      debugPrint('NotificationService init failed: $e');
    }
  }

  /// Creates every channel up front so they appear in the OS settings screen
  /// before the first notification, rather than materialising one at a time.
  Future<void> _createChannels() async {
    final android = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    if (android == null) return;
    for (final c in _channels.values) {
      await android.createNotificationChannel(AndroidNotificationChannel(
        c.id,
        c.name,
        description: c.description,
        importance: c.importance,
      ));
    }
  }

  /// Asks the OS for permission. Called from Settings, on a real tap, never at
  /// launch. Returns false when denied or unavailable.
  Future<bool> requestPermission() async {
    if (!_initialized) await init();
    try {
      final android = _plugin.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      if (android != null) {
        return await android.requestNotificationsPermission() ?? false;
      }
      final ios = _plugin.resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin>();
      if (ios != null) {
        return await ios.requestPermissions(alert: true, badge: true, sound: true) ??
            false;
      }
      final macos = _plugin.resolvePlatformSpecificImplementation<
          MacOSFlutterLocalNotificationsPlugin>();
      if (macos != null) {
        return await macos.requestPermissions(alert: true, badge: true, sound: true) ??
            false;
      }
      return false;
    } on Object catch (e) {
      debugPrint('requestPermission failed: $e');
      return false;
    }
  }

  /// Whether notifications are currently permitted, or null where the platform
  /// will not say.
  Future<bool?> hasPermission() async {
    if (!_initialized) await init();
    try {
      return await _plugin
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.areNotificationsEnabled();
    } on Object catch (e) {
      debugPrint('hasPermission failed: $e');
      return null;
    }
  }

  NotificationDetails _detailsFor(NotifyCategory category) {
    final c = _channels[category] ?? _channels[NotifyCategory.digest]!;
    return NotificationDetails(
      android: AndroidNotificationDetails(
        c.id,
        c.name,
        channelDescription: c.description,
        importance: c.importance,
        priority: c.importance == Importance.high
            ? Priority.high
            : c.importance == Importance.low
                ? Priority.low
                : Priority.defaultPriority,
        // The lock screen is the one place this app's data is legible without
        // the PIN. `private` hides the body there while still showing that
        // something arrived. The planner's hideAmounts pref is the other half.
        visibility: NotificationVisibility.private,
      ),
      iOS: const DarwinNotificationDetails(),
      macOS: const DarwinNotificationDetails(),
    );
  }

  /// Posts a notification now.
  Future<void> showFrom(PlannedNotification n) async {
    if (!_initialized) await init();
    try {
      await _plugin.show(
        n.id,
        n.title,
        n.body,
        _detailsFor(n.category),
        payload: n.deepLink,
      );
    } on Object catch (e) {
      debugPrint('showFrom(${n.dedupeKey}) failed: $e');
    }
  }

  /// Hands one notification to the OS scheduler.
  ///
  /// `inexactAllowWhileIdle` is a deliberate choice, not a default. Exact alarms
  /// need `SCHEDULE_EXACT_ALARM`, which Android 14 stopped auto-granting and
  /// which must now be begged for through a system settings screen; the
  /// alternative `USE_EXACT_ALARM` is restricted by Play policy to alarm-clock
  /// and calendar apps, and a finance app claiming it gets rejected.
  /// `allowWhileIdle` still fires through Doze. The cost is that a 09:00
  /// reminder may arrive at 09:40, which for "your rent is due in three days" is
  /// invisible.
  Future<void> schedule(PlannedNotification n) async {
    if (!_initialized) await init();
    try {
      await _plugin.zonedSchedule(
        n.id,
        n.title,
        n.body,
        tz.TZDateTime.fromMillisecondsSinceEpoch(tz.local, n.fireAt),
        _detailsFor(n.category),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        payload: n.deepLink,
      );
    } on Object catch (e) {
      debugPrint('schedule(${n.dedupeKey}) failed: $e');
    }
  }

  Future<void> cancel(int id) async {
    try {
      await _plugin.cancel(id);
    } on Object catch (e) {
      debugPrint('cancel($id) failed: $e');
    }
  }

  /// What the OS is currently holding for us.
  Future<List<PendingNotificationRequest>> pending() async {
    if (!_initialized) await init();
    try {
      return await _plugin.pendingNotificationRequests();
    } on Object catch (e) {
      debugPrint('pendingNotificationRequests failed: $e');
      return const [];
    }
  }

  /// Brings the OS's pending set in line with [desired], by difference.
  ///
  /// Not cancelAll-then-reschedule: that would churn every alarm on every app
  /// open — a real battery complaint — and on iOS, where the pending cap is 64
  /// per app and the 65th is dropped without an error, it turns a transient
  /// ordering difference into silently lost reminders. Diffing means an
  /// unchanged reminder is left exactly as it is.
  ///
  /// Returns the counts, for the diagnostics panel.
  Future<({int added, int removed, int kept})> reconcile(
    List<PlannedNotification> desired,
  ) async {
    if (!_initialized) await init();
    final want = {for (final n in desired) n.id: n};
    final have = {for (final p in await pending()) p.id};

    var removed = 0;
    for (final id in have) {
      if (want.containsKey(id)) continue;
      await cancel(id);
      removed++;
    }

    var added = 0;
    for (final entry in want.entries) {
      if (have.contains(entry.key)) continue;
      await schedule(entry.value);
      added++;
    }

    return (added: added, removed: removed, kept: want.length - added);
  }

  /// Drops every scheduled reminder. Used when notifications are switched off
  /// and when a vault is erased — alarms outlive the data they describe, and a
  /// reminder about a deleted budget is a leak.
  Future<void> cancelAll() async {
    try {
      await _plugin.cancelAll();
    } on Object catch (e) {
      debugPrint('cancelAll failed: $e');
    }
  }
}
