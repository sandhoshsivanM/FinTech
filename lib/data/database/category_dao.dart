import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'category_dao.g.dart';

/// One DAO per aggregate root (PRD §3C).
@DriftAccessor(tables: [Categories])
class CategoryDao extends DatabaseAccessor<AppDatabase> with _$CategoryDaoMixin {
  CategoryDao(super.db);

  Future<List<CategoryRow>> allForVault(String vaultId) {
    return (select(categories)..where((c) => c.vaultId.equals(vaultId))).get();
  }

  Stream<List<CategoryRow>> watchForVault(String vaultId) {
    return (select(categories)..where((c) => c.vaultId.equals(vaultId)))
        .watch();
  }

  Future<void> upsert(CategoriesCompanion row) {
    return into(categories).insertOnConflictUpdate(row);
  }

  Future<CategoryRow?> findById(String id) {
    return (select(categories)..where((c) => c.id.equals(id)))
        .getSingleOrNull();
  }
}
