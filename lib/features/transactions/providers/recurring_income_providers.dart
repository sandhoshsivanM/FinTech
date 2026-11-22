import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:khazana_domain/entities/transaction.dart';
import 'package:khazana_domain/services/recurring_income.dart';

import 'transaction_providers.dart';

/// Regular monthly income found in the whole ledger. Recomputed when the
/// ledger changes; nothing is stored.
final recurringIncomeProvider = Provider<List<RecurringIncome>>((ref) {
  final state = ref.watch(transactionListProvider);
  final txns = state is TransactionData ? state.transactions : const <Txn>[];
  return detectRecurringIncome(txns);
});

/// Entry id → Salary / Regular, for the chip on ledger rows.
final recurringIncomeByIdProvider = Provider<Map<String, RecurringIncomeKind>>(
  (ref) => recurringIncomeById(ref.watch(recurringIncomeProvider)),
);
