import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../data/database/app_database.dart';
import '../../data/database/logs_database.dart';
import '../../data/repositories/drift_budget_repository.dart';
import '../../data/repositories/drift_category_repository.dart';
import '../../data/repositories/drift_goal_repository.dart';
import '../../data/repositories/drift_holding_repository.dart';
import '../../data/repositories/drift_liability_repository.dart';
import '../../data/repositories/drift_merchant_alias_repository.dart';
import '../../data/repositories/drift_transaction_repository.dart';
import '../../domain/repositories/budget_repository.dart';
import '../../domain/repositories/category_repository.dart';
import '../../domain/repositories/goal_repository.dart';
import '../../domain/repositories/holding_repository.dart';
import '../../domain/repositories/liability_repository.dart';
import '../../domain/repositories/merchant_alias_repository.dart';
import '../../domain/repositories/transaction_repository.dart';
import '../security/vault_state.dart';
import '../services/log_service.dart';
import 'providers.dart';

/// Opens the encrypted database for the currently unlocked vault (PRD §2).
/// Rebuilds when the vault changes; disposed (closed) on lock/switch.
final appDatabaseProvider = FutureProvider<AppDatabase>((ref) async {
  final vault = ref.watch(vaultUnlockProvider);
  if (vault is! VaultUnlocked) {
    throw StateError('Vault is locked — database unavailable.');
  }
  final dir = await getApplicationDocumentsDirectory();
  final path = p.join(dir.path, 'vault_${vault.session.vaultId}.db');
  final db = AppDatabase.encrypted(key: vault.session.key, path: path);
  ref.onDispose(db.close);
  return db;
});

/// Convenience: the opened database (throws/loads via [appDatabaseProvider]).
final databaseProvider = Provider<AppDatabase>((ref) {
  return ref.watch(appDatabaseProvider).requireValue;
});

final transactionRepositoryProvider = Provider<ITransactionRepository>((ref) {
  return DriftTransactionRepository(ref.watch(databaseProvider).transactionDao);
});

final categoryRepositoryProvider = Provider<ICategoryRepository>((ref) {
  return DriftCategoryRepository(ref.watch(databaseProvider).categoryDao);
});

final budgetRepositoryProvider = Provider<IBudgetRepository>((ref) {
  return DriftBudgetRepository(ref.watch(databaseProvider).budgetDao);
});

final merchantAliasRepositoryProvider =
    Provider<IMerchantAliasRepository>((ref) {
  return DriftMerchantAliasRepository(
      ref.watch(databaseProvider).merchantAliasDao);
});

final holdingRepositoryProvider = Provider<IHoldingRepository>((ref) {
  return DriftHoldingRepository(ref.watch(databaseProvider).holdingDao);
});

final liabilityRepositoryProvider = Provider<ILiabilityRepository>((ref) {
  return DriftLiabilityRepository(ref.watch(databaseProvider).liabilityDao);
});

final goalRepositoryProvider = Provider<IGoalRepository>((ref) {
  return DriftGoalRepository(ref.watch(databaseProvider).goalDao);
});

/// The id of the currently unlocked vault (PRD multi-vault; single 'default' in v1).
final currentVaultIdProvider = Provider<String>((ref) {
  final vault = ref.watch(vaultUnlockProvider);
  return vault is VaultUnlocked ? vault.session.vaultId : 'default';
});

/// Documents-directory path of the encrypted vault .db file.
final vaultDbPathProvider = FutureProvider<String>((ref) async {
  final dir = await getApplicationDocumentsDirectory();
  return p.join(dir.path, 'vault_${ref.watch(currentVaultIdProvider)}.db');
});

/// Encrypted local error log database (PRD §5: own logs.db, same vault key).
final logsDatabaseProvider = FutureProvider<LogsDatabase>((ref) async {
  final vault = ref.watch(vaultUnlockProvider);
  if (vault is! VaultUnlocked) {
    throw StateError('Vault is locked — logs unavailable.');
  }
  final dir = await getApplicationDocumentsDirectory();
  final path = p.join(dir.path, 'logs_${vault.session.vaultId}.db');
  final db = LogsDatabase.encrypted(key: vault.session.key, path: path);
  ref.onDispose(db.close);
  return db;
});

final logServiceProvider = Provider<LogService>((ref) {
  final db = ref.watch(logsDatabaseProvider).requireValue;
  return LogService(
    db,
    appVersion: '1.0.0',
    deviceModel: LogService.platformModel,
    osVersion: LogService.platformVersion,
  );
});
