import 'package:decimal/decimal.dart';

import '../entities/pending_capture.dart';

/// Auto-capture repository contract. Pure domain — no Drift imports.
abstract interface class IPendingCaptureRepository {
  /// Captures still waiting for the user, newest first (the review inbox).
  Stream<List<PendingCapture>> watch(String vaultId);

  /// Decided captures from [since] onward, newest first — what the inbox shows
  /// under "recently added" so an auto-post can still be undone.
  Stream<List<PendingCapture>> watchDecided(String vaultId, {required DateTime since});

  Future<PendingCapture?> getById(String id);

  /// Whether a capture with this dedupe key exists in **any** status. Decided
  /// captures count: they are the record that an alert was already handled.
  Future<bool> exists(String vaultId, String fingerprint);

  /// Captures carrying this reference number, in any status. Used to spot the
  /// two legs of a transfer between the user's own accounts.
  Future<List<PendingCapture>> findByUtr(String vaultId, String utr);

  /// The most recently captured "Avl Bal" for [accountId], from any capture
  /// that printed one — the previous link in the balance chain.
  Future<Decimal?> latestBalanceFor(String vaultId, String accountId);

  /// Pending captures for a masked suffix, so linking it once can fill in
  /// every capture already waiting with the same digits.
  Future<List<PendingCapture>> pendingForSuffix(String vaultId, String last4);

  /// Inserts or replaces.
  Future<void> save(PendingCapture capture);
  Future<void> delete(String id);

  /// Removes decided captures captured before [cutoff]. Pending ones are kept
  /// however old — they are still waiting for an answer.
  Future<int> purgeDecidedBefore(String vaultId, DateTime cutoff);
}

/// A remembered "this masked account is that Khazana account".
class CaptureAccountLink {
  const CaptureAccountLink({
    required this.id,
    required this.vaultId,
    required this.profileId,
    required this.last4,
    required this.instrument,
    required this.accountId,
    required this.createdAt,
  });

  final String id;
  final String vaultId;
  final String profileId; // '' when the alert named no bank
  final String last4;
  final CaptureInstrument instrument;
  final String accountId;
  final DateTime createdAt;
}

abstract interface class ICaptureAccountLinkRepository {
  Future<List<CaptureAccountLink>> getAll(String vaultId);
  Stream<List<CaptureAccountLink>> watch(String vaultId);

  /// Upserts on (vault, profile, last4, instrument).
  Future<void> save(CaptureAccountLink link);
  Future<void> delete(String id);
}
