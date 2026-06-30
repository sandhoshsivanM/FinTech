import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../../../domain/entities/pending_capture.dart';

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
}

/// Dart client for the native SMS / notification capture services. Android-only
/// by OS policy — every method is a no-op (or throws) elsewhere, so callers must
/// gate on [supported].
class CaptureChannel {
  const CaptureChannel();

  static const MethodChannel _method = MethodChannel('khazana/capture');
  static const EventChannel _events = EventChannel('khazana/capture/events');

  /// Notification-listener + SMS capture only exist on Android.
  static bool get supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// Stream of captured messages forwarded from the native services.
  Stream<CapturedMessage> events() {
    if (!supported) return const Stream.empty();
    return _events.receiveBroadcastStream().map((e) {
      final m = (e as Map).cast<dynamic, dynamic>();
      return CapturedMessage(
        text: (m['text'] as String?) ?? '',
        sender: m['sender'] as String?,
        source: (m['source'] == 'sms')
            ? CaptureSource.sms
            : CaptureSource.notification,
        postedAt: DateTime.fromMillisecondsSinceEpoch(
          (m['postedAt'] as num?)?.toInt() ??
              DateTime.now().millisecondsSinceEpoch,
        ),
      );
    });
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

  Future<bool> hasSmsPermission() async {
    if (!supported) return false;
    return (await _method.invokeMethod<bool>('hasSmsPermission')) ?? false;
  }

  Future<bool> requestSmsPermission() async {
    if (!supported) return false;
    return (await _method.invokeMethod<bool>('requestSmsPermission')) ?? false;
  }
}
