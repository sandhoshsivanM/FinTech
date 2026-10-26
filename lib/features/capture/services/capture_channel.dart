import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'package:khazana_domain/entities/pending_capture.dart';

/// A raw message handed up from the Android capture services. Carries only the
/// text needed for parsing; it is consumed immediately and never persisted.
class CapturedMessage {
  const CapturedMessage({
    required this.text,
    this.sender,
    required this.source,
    required this.postedAt,
  });

  final String text;
  final String? sender;
  final CaptureSource source;
  final DateTime postedAt;

  static CapturedMessage fromMap(Map<dynamic, dynamic> m) => CapturedMessage(
        text: (m['text'] as String?) ?? '',
        sender: m['sender'] as String?,
        source: (m['source'] == 'sms') ? CaptureSource.sms : CaptureSource.notification,
        postedAt: DateTime.fromMillisecondsSinceEpoch(
          (m['postedAt'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch,
        ),
      );
}

/// Dart client for the native capture services. Android-only by OS policy —
/// every method is a no-op elsewhere, so callers must gate on [supported].
///
/// Two sources:
/// * **Notifications** — every Android build, through the notification listener.
/// * **SMS** — the `sideload` build only ([isSmsAvailable]). The Play build
///   declares no SMS permission until Play approves Khazana under the
///   "SMS-based money management" exception of its SMS/Call Log policy.
class CaptureChannel {
  const CaptureChannel();

  static const MethodChannel _method = MethodChannel('khazana/capture');
  static const EventChannel _events = EventChannel('khazana/capture/events');

  /// The capture services only exist on Android.
  static bool get supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// Stream of captured messages forwarded from the native services.
  Stream<CapturedMessage> events() {
    if (!supported) return const Stream.empty();
    return _events
        .receiveBroadcastStream()
        .map((e) => CapturedMessage.fromMap(e as Map));
  }

  /// Whether this build has the notification listener at all. The `share`
  /// build removes it, so its users are not sent to a settings screen where
  /// Khazana is not listed.
  Future<bool> isNotificationCaptureAvailable() async {
    if (!supported) return false;
    try {
      return (await _method.invokeMethod<bool>('isNotificationCaptureAvailable')) ??
          true;
    } on MissingPluginException {
      return true;
    }
  }

  Future<bool> isNotificationAccessGranted() async {
    if (!supported) return false;
    return (await _method.invokeMethod<bool>('isNotificationAccessGranted')) ??
        false;
  }

  Future<void> openNotificationAccessSettings() async {
    if (!supported) return;
    await _method.invokeMethod<void>('openNotificationAccessSettings');
  }

  /// Whether this build can read SMS at all (sideload: yes, Play: no).
  Future<bool> isSmsAvailable() async {
    if (!supported) return false;
    try {
      return (await _method.invokeMethod<bool>('isSmsCaptureAvailable')) ?? false;
    } on MissingPluginException {
      return false;
    }
  }

  Future<bool> isSmsPermissionGranted() async {
    if (!supported) return false;
    return (await _method.invokeMethod<bool>('isSmsPermissionGranted')) ?? false;
  }

  /// Shows the system SMS permission prompt. Call only after the in-app
  /// disclosure has been accepted (Play's prominent-disclosure rule).
  Future<bool> requestSmsPermission() async {
    if (!supported) return false;
    return (await _method.invokeMethod<bool>('requestSmsPermission')) ?? false;
  }

  /// Bank SMS received after [since], oldest first. Personal messages are
  /// filtered out natively and never cross the channel.
  Future<List<CapturedMessage>> readSmsSince(DateTime since, {int limit = 2000}) async {
    if (!supported) return const [];
    final rows = await _method.invokeListMethod<Map<dynamic, dynamic>>(
      'readSmsSince',
      {'sinceMs': since.millisecondsSinceEpoch, 'limit': limit},
    );
    return [for (final r in rows ?? const []) CapturedMessage.fromMap(r)];
  }
}
