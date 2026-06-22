import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'fingerprint_dao.g.dart';

/// Dedup fingerprints for bank statement import (PRD §13C).
@DriftAccessor(tables: [TransactionFingerprints])
class FingerprintDao extends DatabaseAccessor<AppDatabase>
    with _$FingerprintDaoMixin {
  FingerprintDao(super.db);

  Future<bool> exists(String vaultId, String fingerprint) async {
    final row = await (select(transactionFingerprints)
          ..where((f) =>
              f.vaultId.equals(vaultId) & f.fingerprint.equals(fingerprint)))
        .getSingleOrNull();
    return row != null;
  }

  Future<Set<String>> existingFor(
      String vaultId, List<String> fingerprints) async {
    if (fingerprints.isEmpty) return <String>{};
    final rows = await (select(transactionFingerprints)
          ..where((f) =>
              f.vaultId.equals(vaultId) & f.fingerprint.isIn(fingerprints)))
        .get();
    return rows.map((r) => r.fingerprint).toSet();
  }

  Future<void> insert(String vaultId, String fingerprint) {
    return into(transactionFingerprints).insertOnConflictUpdate(
      TransactionFingerprintsCompanion.insert(
          vaultId: vaultId, fingerprint: fingerprint),
    );
  }
}
