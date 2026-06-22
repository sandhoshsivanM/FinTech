import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/constants/default_categories.dart';
import '../../../core/di/data_providers.dart';
import '../../../domain/entities/category.dart';
import '../../../domain/repositories/category_repository.dart';

const _uuid = Uuid();

/// Ensures the vault has its seed categories, then streams them (PRD §3C naming).
final categoryListProvider = StreamProvider<List<Category>>((ref) async* {
  final repo = ref.watch(categoryRepositoryProvider);
  final vaultId = ref.watch(currentVaultIdProvider);
  await _seedIfEmpty(repo, vaultId);
  yield* repo.watch(vaultId);
});

Future<void> _seedIfEmpty(ICategoryRepository repo, String vaultId) async {
  final existing = await repo.getAll(vaultId);
  if (existing.isNotEmpty) return;
  for (final c in kDefaultCategories) {
    await repo.save(Category(
      id: _uuid.v4(),
      vaultId: vaultId,
      name: c.name,
      iconCodepoint: c.icon.codePoint,
    ));
  }
}

/// Adds a user-defined category.
final addCategoryProvider = Provider((ref) {
  return (String name) async {
    final repo = ref.read(categoryRepositoryProvider);
    final vaultId = ref.read(currentVaultIdProvider);
    await repo.save(Category(id: _uuid.v4(), vaultId: vaultId, name: name));
  };
});
