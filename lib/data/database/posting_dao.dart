import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'posting_dao.g.dart';

@DriftAccessor(tables: [Postings])
class PostingDao extends DatabaseAccessor<AppDatabase> with _$PostingDaoMixin {
  PostingDao(super.db);

  Stream<List<PostingRow>> watchForVault(String vaultId) =>
      (select(postings)..where((p) => p.vaultId.equals(vaultId))).watch();

  Future<List<PostingRow>> allForVault(String vaultId) =>
      (select(postings)..where((p) => p.vaultId.equals(vaultId))).get();

  Future<List<PostingRow>> forEntry(String entryId) =>
      (select(postings)..where((p) => p.entryId.equals(entryId))).get();

  Future<void> upsert(PostingsCompanion row) =>
      into(postings).insertOnConflictUpdate(row);

  /// Replaces all postings for an entry in one transaction (re-derive on edit).
  Future<void> replaceForEntry(
    String entryId,
    List<PostingsCompanion> rows,
  ) async {
    await db.transaction(() async {
      await (delete(postings)..where((p) => p.entryId.equals(entryId))).go();
      for (final r in rows) {
        await into(postings).insert(r);
      }
    });
  }

  Future<void> deleteForEntry(String entryId) =>
      (delete(postings)..where((p) => p.entryId.equals(entryId))).go();
}
