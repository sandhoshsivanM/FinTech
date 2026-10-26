import 'dart:async';

import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/di/data_providers.dart';
import 'package:khazana_domain/entities/pending_capture.dart';
import 'package:khazana_domain/entities/transaction.dart';
import '../../transactions/providers/transaction_providers.dart';
import '../services/capture_channel.dart';
import '../services/capture_pipeline.dart';
import '../services/sms_catch_up.dart';
import 'capture_settings.dart';

final captureChannelProvider =
    Provider<CaptureChannel>((ref) => const CaptureChannel());

/// Posts through [TransactionNotifier], so auto-captured entries take exactly
/// the path a manual entry takes: same postings, same streams, same UI updates.
class _LedgerCapturePoster implements CapturePoster {
  _LedgerCapturePoster(this._ref);
  final Ref _ref;

  @override
  Future<String> post({
    required Decimal amount,
    required TxnType type,
    required String categoryId,
    required DateTime date,
    String? merchant,
    String? accountId,
    required String source,
    required String captureId,
  }) async {
    final category =
        await _ref.read(categoryRepositoryProvider).getById(categoryId);
    return _ref.read(transactionListProvider.notifier).add(
          amount: amount,
          type: type,
          categoryId: categoryId,
          categoryName: category?.name,
          date: date,
          merchant: merchant,
          accountId: accountId,
          source: source,
          captureId: captureId,
        );
  }

  @override
  Future<void> remove(String txnId) =>
      _ref.read(transactionListProvider.notifier).remove(txnId);
}

final capturePosterProvider =
    Provider<CapturePoster>((ref) => _LedgerCapturePoster(ref));

final capturePipelineProvider = Provider<CapturePipeline>((ref) {
  return CapturePipeline(
    repo: ref.watch(pendingCaptureRepositoryProvider),
    links: ref.watch(captureAccountLinkRepositoryProvider),
    aliases: ref.watch(merchantAliasRepositoryProvider),
    transactions: ref.watch(transactionRepositoryProvider),
    poster: ref.watch(capturePosterProvider),
    vaultId: ref.watch(currentVaultIdProvider),
    // Read at decision time, so flipping the switch applies to the very next
    // message without rebuilding the pipeline.
    alwaysReview: () => !ref.read(captureAutoPostProvider),
  );
});

final captureReviewProvider = Provider<CaptureReviewService>((ref) {
  return CaptureReviewService(
    repo: ref.watch(pendingCaptureRepositoryProvider),
    links: ref.watch(captureAccountLinkRepositoryProvider),
    aliases: ref.watch(merchantAliasRepositoryProvider),
    poster: ref.watch(capturePosterProvider),
    vaultId: ref.watch(currentVaultIdProvider),
  );
});

/// The review inbox: captures still waiting for the user, newest first.
final pendingCaptureListProvider = StreamProvider<List<PendingCapture>>((ref) {
  return ref
      .watch(pendingCaptureRepositoryProvider)
      .watch(ref.watch(currentVaultIdProvider));
});

/// How far back the inbox's "recently added" list reaches. Long enough to
/// notice a wrong automatic add on the weekend after it happened.
const recentlyDecidedWindow = Duration(days: 7);

/// Captures decided in the last [recentlyDecidedWindow], newest first — the
/// automatic adds can still be undone from here.
final recentlyDecidedCaptureProvider =
    StreamProvider<List<PendingCapture>>((ref) {
  return ref.watch(pendingCaptureRepositoryProvider).watchDecided(
        ref.watch(currentVaultIdProvider),
        since: DateTime.now().subtract(recentlyDecidedWindow),
      );
});

/// The latest automatic add, for the shell's "Added · Undo" snackbar.
final lastAutoPostedCaptureProvider =
    StateProvider<PendingCapture?>((ref) => null);

/// Whether the device can auto-capture (Android only).
final captureSupportedProvider = Provider<bool>((ref) => CaptureChannel.supported);

/// Whether this build has the notification listener (false on the `share`
/// build and off Android).
final notificationCaptureAvailableProvider = FutureProvider<bool>(
    (ref) => ref.watch(captureChannelProvider).isNotificationCaptureAvailable());

/// Whether this build reads SMS (the `sideload` flavor) — false on Play builds
/// and off Android.
final smsAvailableProvider = FutureProvider<bool>(
    (ref) => ref.watch(captureChannelProvider).isSmsAvailable());

/// Whether SMS permission is granted. Invalidate after asking for it.
final smsPermissionProvider = FutureProvider<bool>(
    (ref) => ref.watch(captureChannelProvider).isSmsPermissionGranted());

class _PrefsSmsScanCursor implements SmsScanCursor {
  _PrefsSmsScanCursor(this._vaultId);
  final String _vaultId;
  String get _key => 'capture_sms_cursor_v1_$_vaultId';

  @override
  Future<DateTime?> read() async {
    final prefs = await SharedPreferences.getInstance();
    final ms = prefs.getInt(_key);
    return ms == null ? null : DateTime.fromMillisecondsSinceEpoch(ms);
  }

  @override
  Future<void> write(DateTime at) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_key, at.millisecondsSinceEpoch);
  }
}

final smsCatchUpProvider = Provider<SmsCatchUp>((ref) {
  return SmsCatchUp(
    channel: ref.watch(captureChannelProvider),
    pipeline: ref.watch(capturePipelineProvider),
    cursor: _PrefsSmsScanCursor(ref.watch(currentVaultIdProvider)),
  );
});

/// The outcome of the last catch-up or history import, for one summary
/// snackbar instead of one per message.
final lastSmsCatchUpProvider = StateProvider<SmsCatchUpResult?>((ref) => null);

/// Subscribes to the native capture stream and feeds the pipeline while mounted.
/// Watch this from the app shell so capture runs whenever the vault is unlocked.
///
/// Messages are processed strictly one at a time. Android often posts the same
/// bank notification twice within milliseconds; run concurrently, both copies
/// would pass the "already seen?" check before either was saved, and the alert
/// would be recorded twice.
final captureListenerProvider = Provider<void>((ref) {
  if (!CaptureChannel.supported) return;
  final channel = ref.watch(captureChannelProvider);
  final pipeline = ref.watch(capturePipelineProvider);
  final catchUp = ref.watch(smsCatchUpProvider);

  // On unlock: tidy up, then read the bank SMS that arrived while the app was
  // closed. Queued like any message, so live events wait behind it.
  var queue = pipeline.purgeOld().then<void>((_) {}, onError: (_) {}).then((_) async {
    final result = await catchUp.run();
    if (!result.isEmpty) {
      ref.read(lastSmsCatchUpProvider.notifier).state = result;
    }
  }).catchError((Object _) {});
  final sub = channel.events().listen(
    (msg) {
      queue = queue.then((_) async {
        final outcome = await pipeline.ingest(msg);
        if (outcome.result == IngestResult.autoPosted) {
          ref.read(lastAutoPostedCaptureProvider.notifier).state = outcome.capture;
        }
      }).catchError((Object _) {
        // Capture is best-effort: one bad message must not stall the queue.
      });
    },
    onError: (_) {/* capture is best-effort; ignore stream errors */},
  );
  ref.onDispose(sub.cancel);
});
