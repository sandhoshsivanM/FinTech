import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'pending_capture_dao.g.dart';

@DriftAccessor(tables: [PendingCaptures, CaptureAccountLinks])
class PendingCaptureDao extends DatabaseAccessor<AppDatabase>
    with _$PendingCaptureDaoMixin {
  PendingCaptureDao(super.db);

  /// The review inbox: captures still waiting for an answer.
  Stream<List<PendingCaptureRow>> watchPending(String vaultId) =>
      (select(pendingCaptures)
            ..where((c) => c.vaultId.equals(vaultId) & c.status.equals('pending'))
            ..orderBy([(c) => OrderingTerm.desc(c.capturedAt)]))
          .watch();

  Stream<List<PendingCaptureRow>> watchDecided(String vaultId, int sinceMs) =>
      (select(pendingCaptures)
            ..where((c) =>
                c.vaultId.equals(vaultId) &
                c.status.equals('pending').not() &
                c.capturedAt.isBiggerOrEqualValue(sinceMs))
            ..orderBy([(c) => OrderingTerm.desc(c.capturedAt)]))
          .watch();

  Future<List<PendingCaptureRow>> allForVault(String vaultId) =>
      (select(pendingCaptures)..where((c) => c.vaultId.equals(vaultId))).get();

  Future<PendingCaptureRow?> getById(String id) =>
      (select(pendingCaptures)..where((c) => c.id.equals(id))).getSingleOrNull();

  /// Index seek on (vault_id, fingerprint) — see `_createCaptureIndexes`.
  Future<bool> existsByFingerprint(String vaultId, String fingerprint) async {
    final row = await (select(pendingCaptures)
          ..where((c) =>
              c.vaultId.equals(vaultId) & c.fingerprint.equals(fingerprint))
          ..limit(1))
        .getSingleOrNull();
    return row != null;
  }

  Future<List<PendingCaptureRow>> findByUtr(String vaultId, String utr) =>
      (select(pendingCaptures)
            ..where((c) => c.vaultId.equals(vaultId) & c.utr.equals(utr)))
          .get();

  Future<PendingCaptureRow?> latestWithBalance(String vaultId, String accountId) =>
      (select(pendingCaptures)
            ..where((c) =>
                c.vaultId.equals(vaultId) &
                c.accountId.equals(accountId) &
                c.availableBalance.isNotNull())
            ..orderBy([(c) => OrderingTerm.desc(c.capturedAt)])
            ..limit(1))
          .getSingleOrNull();

  Future<List<PendingCaptureRow>> pendingForSuffix(String vaultId, String last4) =>
      (select(pendingCaptures)
            ..where((c) =>
                c.vaultId.equals(vaultId) &
                c.status.equals('pending') &
                c.accountLast4.equals(last4)))
          .get();

  Future<void> upsert(PendingCapturesCompanion row) =>
      into(pendingCaptures).insertOnConflictUpdate(row);

  Future<void> deleteById(String id) =>
      (delete(pendingCaptures)..where((c) => c.id.equals(id))).go();

  Future<int> purgeDecidedBefore(String vaultId, int cutoffMs) =>
      (delete(pendingCaptures)
            ..where((c) =>
                c.vaultId.equals(vaultId) &
                c.status.equals('pending').not() &
                c.capturedAt.isSmallerThanValue(cutoffMs)))
          .go();

  // ---- account links ----

  Future<List<CaptureAccountLinkRow>> linksForVault(String vaultId) =>
      (select(captureAccountLinks)..where((l) => l.vaultId.equals(vaultId)))
          .get();

  Stream<List<CaptureAccountLinkRow>> watchLinks(String vaultId) =>
      (select(captureAccountLinks)..where((l) => l.vaultId.equals(vaultId)))
          .watch();

  /// Upsert on the natural key, so re-linking a suffix replaces the old answer
  /// instead of failing the unique constraint.
  Future<void> upsertLink(CaptureAccountLinksCompanion row) =>
      into(captureAccountLinks).insert(
        row,
        onConflict: DoUpdate(
          (_) => CaptureAccountLinksCompanion(accountId: row.accountId),
          target: [
            captureAccountLinks.vaultId,
            captureAccountLinks.profileId,
            captureAccountLinks.last4,
            captureAccountLinks.instrument,
          ],
        ),
      );

  Future<void> deleteLink(String id) =>
      (delete(captureAccountLinks)..where((l) => l.id.equals(id))).go();
}
