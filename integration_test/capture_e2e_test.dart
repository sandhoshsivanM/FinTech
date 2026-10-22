import 'dart:io';
import 'dart:typed_data';

import 'package:decimal/decimal.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:khazana/core/di/data_providers.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/database/encrypted_executor.dart';
import 'package:khazana/domain/entities/pending_capture.dart';
import 'package:khazana/features/capture/providers/capture_providers.dart';
import 'package:khazana/features/capture/services/capture_channel.dart';

/// Device-only, Android `sideload` flavor: auto-capture end to end through the
/// real OS. Run with tool/run_capture_e2e.sh, which grants the permissions
/// first (notification access and SMS can only be granted outside the app).
///
/// Only the app's UI shell is skipped: the vault is a throwaway SQLCipher file
/// opened with a fixed test key, so no PIN screen is needed. Everything a real alert touches is real: Android's
/// notification listener, CaptureBus, the platform channel, the pipeline,
/// the router and the database; for SMS, the phone's actual SMS inbox.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late ProviderContainer container;
  late Directory dir;
  const vault = 'e2e';

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('capture_e2e');
    db = AppDatabase(openEncrypted(
        Uint8List.fromList(List.generate(32, (i) => i)), '${dir.path}/vault.db'));
    container = ProviderContainer(overrides: [
      databaseProvider.overrideWithValue(db),
      currentVaultIdProvider.overrideWithValue(vault),
    ]);
  });

  tearDown(() async {
    container.dispose();
    await db.close();
    await dir.delete(recursive: true);
  });

  /// `flutter test` installs a fresh build, so tool/run_capture_e2e.sh grants
  /// access a moment after the app starts; wait for it rather than racing it.
  Future<bool> eventually(Future<bool> Function() check) async {
    for (var i = 0; i < 60; i++) {
      if (await check()) return true;
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    return false;
  }

  /// Polls the review inbox, because delivery through the OS is asynchronous.
  Future<PendingCapture?> waitForCapture(bool Function(PendingCapture) match) async {
    final repo = container.read(pendingCaptureRepositoryProvider);
    for (var i = 0; i < 40; i++) {
      final pending = await repo.watch(vault).first;
      final hit = pending.where(match).firstOrNull;
      if (hit != null) return hit;
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }
    return null;
  }

  testWidgets('a bank notification travels listener -> bus -> pipeline -> inbox',
      (tester) async {
    expect(await eventually(const CaptureChannel().isNotificationAccessGranted), isTrue,
        reason: 'grant it first: tool/run_capture_e2e.sh does');

    // Subscribe to the native stream, exactly as the app shell does on unlock.
    container.read(captureListenerProvider);

    // Post a real Android notification shaped like an HDFC alert. The OS hands
    // it to KhazanaNotificationListener like any other app's notification.
    final plugin = FlutterLocalNotificationsPlugin();
    await plugin.initialize(const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher')));
    await plugin.show(
      4242,
      'HDFC Bank',
      'Rs.250.00 debited from a/c XX1234 at E2E CAFE on 05-01-26. '
          'Avl Bal Rs.9,750.00',
      const NotificationDetails(
        android: AndroidNotificationDetails('e2e', 'E2E',
            importance: Importance.high, priority: Priority.high),
      ),
    );

    final capture = await waitForCapture((c) => c.merchant == 'e2e cafe');
    await plugin.cancel(4242);

    expect(capture, isNotNull, reason: 'the notification never reached the inbox');
    expect(capture!.source, CaptureSource.notification);
    expect(capture.amount, Decimal.parse('250'));
    expect(capture.accountLast4, '1234');
    expect(capture.availableBalance, Decimal.parse('9750'));
    expect(capture.profileId, 'hdfc');
    expect(capture.status, CaptureStatus.pending,
        reason: 'an unlinked account must wait for review, never auto-post');
    expect(capture.reasons, contains(ReviewReason.unknownAccount));
  });

  testWidgets('bank SMS in the phone inbox is imported; personal SMS is not',
      (tester) async {
    final channel = container.read(captureChannelProvider);
    expect(await channel.isSmsAvailable(), isTrue, reason: 'run the sideload flavor');
    expect(await eventually(channel.isSmsPermissionGranted), isTrue,
        reason: 'grant it first: tool/run_capture_e2e.sh does');

    // tool/run_capture_e2e.sh put two SMS in the emulator's inbox before this
    // ran: one from a bank sender ID and one from a phone number.
    final result = await container.read(smsCatchUpProvider)
        .importHistory(window: const Duration(days: 1));

    final bank = await waitForCapture((c) => c.merchant == 'sms e2e store');
    expect(bank, isNotNull, reason: 'the bank SMS was not imported');
    expect(bank!.source, CaptureSource.sms);
    expect(bank.amount, Decimal.parse('499'));
    expect(bank.utr, '412345678999');

    final pending = await container.read(pendingCaptureRepositoryProvider).watch(vault).first;
    expect(pending.where((c) => c.merchant == 'personal sender'), isEmpty,
        reason: 'an SMS from a phone number must never leave Android-side code');
    expect(result.queued, greaterThanOrEqualTo(1));
  });
}
