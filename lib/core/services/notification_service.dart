import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Local-only notifications (PRD §2: no server push). Used for budget
/// overspend alerts (PRD §7A). Best-effort: failures never crash the app.
class NotificationService {
  NotificationService([FlutterLocalNotificationsPlugin? plugin])
      : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  bool _initialized = false;

  static const _channelId = 'budget_alerts';
  static const _channelName = 'Budget Alerts';

  Future<void> init() async {
    if (_initialized) return;
    try {
      const settings = InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      );
      await _plugin.initialize(settings);
      // Android 13+ runtime permission (PRD pitfall).
      await _plugin
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
      _initialized = true;
    } on Exception catch (e) {
      debugPrint('NotificationService init failed: $e');
    }
  }

  /// Generic local notification (e.g. recurring transactions added).
  Future<void> showInfo({
    required int id,
    required String title,
    required String body,
  }) async {
    if (!_initialized) await init();
    try {
      await _plugin.show(
        id,
        title,
        body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            _channelId,
            _channelName,
            importance: Importance.defaultImportance,
            priority: Priority.defaultPriority,
          ),
          iOS: DarwinNotificationDetails(),
        ),
      );
    } on Exception catch (e) {
      debugPrint('showInfo failed: $e');
    }
  }

  /// Fires an overspend alert for a category (PRD §7A).
  Future<void> showOverspendAlert({
    required int id,
    required String categoryName,
    required int thresholdPct,
  }) async {
    if (!_initialized) await init();
    try {
      await _plugin.show(
        id,
        'Budget alert: $categoryName',
        "You've used $thresholdPct% or more of your $categoryName budget this month.",
        const NotificationDetails(
          android: AndroidNotificationDetails(
            _channelId,
            _channelName,
            channelDescription: 'Alerts when a category nears its budget limit',
            importance: Importance.high,
            priority: Priority.high,
          ),
          iOS: DarwinNotificationDetails(),
        ),
      );
    } on Exception catch (e) {
      debugPrint('showOverspendAlert failed: $e');
    }
  }
}
