import '../entities/category.dart';

/// Category repository contract (PRD §3C). Pure domain — no Drift imports.
abstract interface class ICategoryRepository {
  Stream<List<Category>> watch(String vaultId);
  Future<List<Category>> getAll(String vaultId);
  Future<void> save(Category category);
  Future<Category?> getById(String id);
}
