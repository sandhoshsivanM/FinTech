import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../data/database/app_database.dart';
import '../../data/database/logs_database.dart';
import '../branding.dart';
import '../services/crash_guard.dart';
import '../../data/repositories/drift_account_repository.dart';
import '../../data/repositories/drift_budget_repository.dart';
import '../../data/repositories/drift_category_repository.dart';
import '../../data/repositories/drift_goal_repository.dart';
import '../../data/repositories/drift_insurance_repository.dart';
import '../../data/repositories/drift_liability_repository.dart';
import '../../data/repositories/drift_merchant_alias_repository.dart';
import '../../data/repositories/drift_net_worth_snapshot_repository.dart';
import '../../data/repositories/drift_pending_capture_repository.dart';
import '../../data/repositories/drift_posting_repository.dart';
import '../../data/repositories/drift_recurring_repository.dart';
import '../../data/repositories/drift_transaction_repository.dart';
import '../../domain/repositories/account_repository.dart';
import '../../domain/repositories/budget_repository.dart';
import '../../domain/repositories/category_repository.dart';
import '../../domain/repositories/goal_repository.dart';
import '../../domain/repositories/insurance_repository.dart';
import '../../domain/repositories/liability_repository.dart';
import '../../domain/repositories/merchant_alias_repository.dart';
import '../../domain/repositories/net_worth_snapshot_repository.dart';
import '../../domain/repositories/pending_capture_repository.dart';
import '../../domain/repositories/posting_repository.dart';
import '../../domain/repositories/recurring_repository.dart';
import '../../domain/repositories/transaction_repository.dart';
import '../security/vault_state.dart';
import '../services/log_service.dart';
import 'providers.dart';

/// Resolves the on-disk path for a vault file. On web there is no filesystem
/// (the executor is in-memory), so the path is just a logical name and
/// path_provider — which has no web implementation — is not called.
Future<String> _vaultFilePath(String fileName) async {
  if (kIsWeb) return fileName;
  final dir = await getApplicationDocumentsDirectory();
  return p.join(dir.path, fileName);
}

/// Opens the encrypted database for the currently unlocked vault (PRD §2).
/// Rebuilds when the vault changes; disposed (closed) on lock/switch.
final appDatabaseProvider = FutureProvider<AppDatabase>((ref) async {
  final vault = ref.watch(vaultUnlockProvider);
  if (vault is! VaultUnlocked) {
    throw StateError('Vault is locked — database unavailable.');
  }
  final path = await _vaultFilePath('vault_${vault.session.vaultId}.db');
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

final liabilityRepositoryProvider = Provider<ILiabilityRepository>((ref) {
  return DriftLiabilityRepository(ref.watch(databaseProvider).liabilityDao);
});

final goalRepositoryProvider = Provider<IGoalRepository>((ref) {
  return DriftGoalRepository(ref.watch(databaseProvider).goalDao);
});

final recurringRepositoryProvider = Provider<IRecurringRepository>((ref) {
  return DriftRecurringRepository(ref.watch(databaseProvider).recurringDao);
});

final insuranceRepositoryProvider = Provider<IInsuranceRepository>((ref) {
  return DriftInsuranceRepository(ref.watch(databaseProvider).insuranceDao);
});

final netWorthSnapshotRepositoryProvider =
    Provider<INetWorthSnapshotRepository>((ref) {
  return DriftNetWorthSnapshotRepository(ref.watch(databaseProvider).snapshotDao);
});

final accountRepositoryProvider = Provider<IAccountRepository>((ref) {
  return DriftAccountRepository(ref.watch(databaseProvider).accountDao);
});

final postingRepositoryProvider = Provider<IPostingRepository>((ref) {
  return DriftPostingRepository(ref.watch(databaseProvider).postingDao);
});

final pendingCaptureRepositoryProvider =
    Provider<IPendingCaptureRepository>((ref) {
  return DriftPendingCaptureRepository(
      ref.watch(databaseProvider).pendingCaptureDao);
});

/// The id of the currently unlocked vault (PRD multi-vault; single 'default' in v1).
final currentVaultIdProvider = Provider<String>((ref) {
  final vault = ref.watch(vaultUnlockProvider);
  return vault is VaultUnlocked ? vault.session.vaultId : 'default';
});

/// Documents-directory path of the encrypted vault .db file.
final vaultDbPathProvider = FutureProvider<String>((ref) async {
  return _vaultFilePath('vault_${ref.watch(currentVaultIdProvider)}.db');
});

/// Encrypted local error log database (PRD §5: own logs.db, same vault key).
final logsDatabaseProvider = FutureProvider<LogsDatabase>((ref) async {
  final vault = ref.watch(vaultUnlockProvider);
  if (vault is! VaultUnlocked) {
    throw StateError('Vault is locked — logs unavailable.');
  }
  final path = await _vaultFilePath('logs_${vault.session.vaultId}.db');
  final db = LogsDatabase.encrypted(key: vault.session.key, path: path);
  ref.onDispose(db.close);
  return db;
});

final logServiceProvider = Provider<LogService>((ref) {
  final db = ref.watch(logsDatabaseProvider).requireValue;
  return LogService(
    db,
    appVersion: kAppVersion,
    deviceModel: LogService.platformModel,
    osVersion: LogService.platformVersion,
  );
});

/// Connects [CrashGuard]'s in-memory buffer to the encrypted log once there is
/// a vault to write into, and disconnects it when the vault locks.
///
/// Startup crashes happen before any key exists, so they are held in memory
/// until this fires. If the user never unlocks, they are never written — which
/// is the right outcome: an unencrypted crash log sitting next to an encrypted
/// vault would be the weakest point in the product.
final crashLogSinkProvider = Provider<void>((ref) {
  final logs = ref.watch(logsDatabaseProvider);

  logs.whenData((_) {
    final service = ref.read(logServiceProvider);
    CrashGuard.drainTo((rec) => service.log(
          LogLevel.fatal,
          rec.tag,
          rec.message,
          stackTrace: rec.stackTrace,
        ));
  });

  ref.onDispose(CrashGuard.detach);
});
