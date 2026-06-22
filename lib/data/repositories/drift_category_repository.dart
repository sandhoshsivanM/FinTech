import 'package:drift/drift.dart';

import '../../domain/entities/category.dart';
import '../../domain/repositories/category_repository.dart';
import '../database/app_database.dart';
import '../database/category_dao.dart';

/// Drift-backed category repository (PRD §3C `DriftCategoryRepository`).
class DriftCategoryRepository implements ICategoryRepository {
  DriftCategoryRepository(this._dao);

  final CategoryDao _dao;

  @override
  Stream<List<Category>> watch(String vaultId) =>
      _dao.watchForVault(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Future<List<Category>> getAll(String vaultId) async =>
      (await _dao.allForVault(vaultId)).map(_toEntity).toList();

  @override
  Future<Category?> getById(String id) async {
    final row = await _dao.findById(id);
    return row == null ? null : _toEntity(row);
  }

  @override
  Future<void> save(Category c) => _dao.upsert(CategoriesCompanion(
        id: Value(c.id),
        vaultId: Value(c.vaultId),
        name: Value(c.name),
        iconCodepoint: Value(c.iconCodepoint),
      ));

  static Category _toEntity(CategoryRow r) => Category(
        id: r.id,
        vaultId: r.vaultId,
        name: r.name,
        iconCodepoint: r.iconCodepoint,
      );
}
