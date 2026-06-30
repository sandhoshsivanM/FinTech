import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'pending_capture_dao.g.dart';

@DriftAccessor(tables: [PendingCaptures])
class PendingCaptureDao extends DatabaseAccessor<AppDatabase>
    with _$PendingCaptureDaoMixin {
  PendingCaptureDao(super.db);

  Stream<List<PendingCaptureRow>> watchForVault(String vaultId) =>
      (select(pendingCaptures)
            ..where((c) => c.vaultId.equals(vaultId))
            ..orderBy([(c) => OrderingTerm.desc(c.capturedAt)]))
          .watch();

  Future<List<PendingCaptureRow>> allForVault(String vaultId) =>
      (select(pendingCaptures)..where((c) => c.vaultId.equals(vaultId))).get();

  Future<bool> existsByFingerprint(String vaultId, String fingerprint) async {
    final row = await (select(pendingCaptures)
          ..where((c) =>
              c.vaultId.equals(vaultId) & c.fingerprint.equals(fingerprint))
          ..limit(1))
        .getSingleOrNull();
    return row != null;
  }

  Future<void> upsert(PendingCapturesCompanion row) =>
      into(pendingCaptures).insertOnConflictUpdate(row);

  Future<void> deleteById(String id) =>
      (delete(pendingCaptures)..where((c) => c.id.equals(id))).go();
}
