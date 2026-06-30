import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/data_providers.dart';
import '../../../domain/entities/pending_capture.dart';
import '../../transactions/providers/transaction_providers.dart';
import '../services/capture_channel.dart';
import '../services/capture_pipeline.dart';

final captureChannelProvider =
    Provider<CaptureChannel>((ref) => const CaptureChannel());

final capturePipelineProvider = Provider<CapturePipeline>((ref) {
  return CapturePipeline(
    repo: ref.watch(pendingCaptureRepositoryProvider),
    vaultId: ref.watch(currentVaultIdProvider),
  );
});

/// Live review queue of auto-captured drafts, newest first.
final pendingCaptureListProvider = StreamProvider<List<PendingCapture>>((ref) {
  return ref
      .watch(pendingCaptureRepositoryProvider)
      .watch(ref.watch(currentVaultIdProvider));
});

/// Whether the device can auto-capture (Android only).
final captureSupportedProvider = Provider<bool>((ref) => CaptureChannel.supported);

/// Subscribes to the native capture stream and feeds the pipeline while mounted.
/// Watch this from the app shell so capture runs whenever the vault is unlocked.
final captureListenerProvider = Provider<void>((ref) {
  if (!CaptureChannel.supported) return;
  final channel = ref.watch(captureChannelProvider);
  final pipeline = ref.watch(capturePipelineProvider);
  final sub = channel.events().listen(
        (msg) => pipeline.ingest(msg),
        onError: (_) {/* capture is best-effort; ignore stream errors */},
      );
  ref.onDispose(sub.cancel);
});

final captureActionsProvider =
    Provider<CaptureActions>((ref) => CaptureActions(ref));

/// Review-queue actions: confirm a draft into a balanced double-entry
/// transaction, or dismiss it.
class CaptureActions {
  CaptureActions(this._ref);
  final Ref _ref;

  Future<void> confirm(
    PendingCapture c, {
    required String categoryId,
    String? categoryName,
  }) async {
    await _ref.read(transactionListProvider.notifier).add(
          amount: c.amount,
          type: c.type,
          categoryId: categoryId,
          date: c.occurredAt,
          merchant: c.merchant,
          categoryName: categoryName,
        );
    await _ref.read(pendingCaptureRepositoryProvider).delete(c.id);
  }

  Future<void> dismiss(PendingCapture c) =>
      _ref.read(pendingCaptureRepositoryProvider).delete(c.id);
}
