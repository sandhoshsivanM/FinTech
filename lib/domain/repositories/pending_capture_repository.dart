import '../entities/pending_capture.dart';

/// Auto-capture review-queue repository contract. Pure domain — no Drift imports.
abstract interface class IPendingCaptureRepository {
  Stream<List<PendingCapture>> watch(String vaultId);
  Future<bool> exists(String vaultId, String fingerprint);
  Future<void> save(PendingCapture capture);
  Future<void> delete(String id);
}
