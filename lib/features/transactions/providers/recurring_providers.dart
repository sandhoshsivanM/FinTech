import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../data/database/app_database.dart';
import '../../../domain/entities/recurring_rule.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/services/recurrence_calculator.dart';
import '../../budget/providers/budget_providers.dart';

const _uuid = Uuid();

final recurrenceCalculatorProvider =
    Provider<RecurrenceCalculator>((ref) => const RecurrenceCalculator());

final recurringListProvider = StreamProvider<List<RecurringRule>>((ref) {
  return ref
      .watch(recurringRepositoryProvider)
      .watch(ref.watch(currentVaultIdProvider));
});

final recurringActionsProvider =
    Provider<RecurringActions>((ref) => RecurringActions(ref));

class RecurringActions {
  RecurringActions(this._ref);
  final Ref _ref;

  Future<void> add({
    required Decimal amount,
    required TxnType type,
    required String categoryId,
    required Frequency frequency,
    required DateTime firstRun,
    String? merchant,
  }) {
    return _ref.read(recurringRepositoryProvider).save(RecurringRule(
          id: _uuid.v4(),
          vaultId: _ref.read(currentVaultIdProvider),
          amount: amount,
          type: type,
          categoryId: categoryId,
          merchant: merchant,
          frequency: frequency,
          nextRun: firstRun,
        ));
  }

  Future<void> delete(String id) =>
      _ref.read(recurringRepositoryProvider).delete(id);

  /// Materializes all due recurring rules into transactions and advances their
  /// nextRun (PRD §14). Returns the number of transactions created.
  Future<int> processDue({DateTime? now}) async {
    final today = now ?? DateTime.now();
    final vaultId = _ref.read(currentVaultIdProvider);
    final repo = _ref.read(recurringRepositoryProvider);
    final calc = _ref.read(recurrenceCalculatorProvider);
    final database = _ref.read(databaseProvider);
    final rules = await repo.activeRules(vaultId);

    var created = 0;
    for (final rule in rules) {
      final result = calc.materialize(rule, today);
      if (result.due.isEmpty) continue;
      await database.transaction(() async {
        for (final occ in result.due) {
          await database.transactionDao.upsert(TransactionsCompanion(
            id: Value(_uuid.v4()),
            vaultId: Value(vaultId),
            amount: Value(rule.amount),
            type: Value(rule.type.name),
            categoryId: Value(rule.categoryId),
            merchant: Value(rule.merchant),
            note: Value(rule.note ?? 'Recurring'),
            date: Value(occ.date.millisecondsSinceEpoch),
            createdAt: Value(today.millisecondsSinceEpoch),
          ));
          created++;
        }
      });
      await repo.save(rule.copyWith(nextRun: result.newNextRun));
    }
    if (created > 0) {
      // Local-only notification (PRD §2 no server push).
      await _ref.read(notificationServiceProvider).showInfo(
            id: 909001,
            title: 'Recurring transactions added',
            body: '$created scheduled transaction(s) were recorded.',
          );
    }
    return created;
  }
}

/// Runs recurring materialization once when the DB becomes available.
final recurringProcessorProvider = FutureProvider<int>((ref) async {
  await ref.watch(appDatabaseProvider.future);
  return ref.read(recurringActionsProvider).processDue();
});
