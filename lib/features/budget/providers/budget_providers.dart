import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../core/services/notification_service.dart';
import '../../../domain/entities/budget.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/services/budget_calculator.dart';
import '../../transactions/providers/category_providers.dart';
import '../../transactions/providers/transaction_providers.dart';

const _uuid = Uuid();

final budgetCalculatorProvider =
    Provider<BudgetCalculator>((ref) => const BudgetCalculator());

final notificationServiceProvider =
    Provider<NotificationService>((ref) => NotificationService());

/// Streams the vault's budgets.
final budgetListProvider = StreamProvider<List<Budget>>((ref) {
  final repo = ref.watch(budgetRepositoryProvider);
  return repo.watch(ref.watch(currentVaultIdProvider));
});

/// Budgets evaluated against the current month's spend (PRD §7C: computed on
/// read, never stored).
final budgetProgressProvider = Provider<List<BudgetProgress>>((ref) {
  final budgets = ref.watch(budgetListProvider).valueOrNull ?? const [];
  final txnState = ref.watch(transactionListProvider);
  final calc = ref.watch(budgetCalculatorProvider);
  final List<Txn> txns =
      txnState is TransactionData ? txnState.transactions : const <Txn>[];
  final (first, last) = calc.monthRange(DateTime.now());
  return [
    for (final b in budgets)
      calc.evaluate(b, calc.spent(txns, b.categoryId, first, last)),
  ];
});

/// Budget CRUD + 50/30/20 quick-start (PRD §7A).
final budgetActionsProvider = Provider<BudgetActions>((ref) => BudgetActions(ref));

class BudgetActions {
  BudgetActions(this._ref);
  final Ref _ref;

  Future<void> add({
    required String categoryId,
    required Decimal limit,
    bool rollover = false,
    int alertThresholdPct = 90,
  }) async {
    final repo = _ref.read(budgetRepositoryProvider);
    await repo.save(Budget(
      id: _uuid.v4(),
      vaultId: _ref.read(currentVaultIdProvider),
      categoryId: categoryId,
      amountLimit: limit,
      rolloverEnabled: rollover,
      alertThresholdPct: alertThresholdPct,
    ));
  }

  Future<void> delete(String id) =>
      _ref.read(budgetRepositoryProvider).delete(id);

  /// Re-evaluates budgets after a change and fires an overspend notification
  /// for any category at/over its alert threshold (PRD §7A).
  Future<void> checkAndNotify() async {
    final progress = _ref.read(budgetProgressProvider);
    final calc = _ref.read(budgetCalculatorProvider);
    final categories =
        _ref.read(categoryListProvider).valueOrNull ?? const [];
    final byId = {for (final c in categories) c.id: c};
    final notifier = _ref.read(notificationServiceProvider);
    for (final p in progress) {
      if (calc.isAtAlertThreshold(p.budget, p.spent)) {
        await notifier.showOverspendAlert(
          id: p.budget.categoryId.hashCode & 0x7fffffff,
          categoryName: byId[p.budget.categoryId]?.name ?? 'Category',
          thresholdPct: p.budget.alertThresholdPct,
        );
      }
    }
  }
}
