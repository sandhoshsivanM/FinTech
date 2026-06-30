import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../domain/entities/transaction.dart';
import '../../../domain/services/calendar_aggregator.dart';
import '../../transactions/providers/transaction_providers.dart';

final calendarAggregatorProvider =
    Provider<CalendarAggregator>((ref) => const CalendarAggregator());

/// The month currently shown in the calendar (first-of-month).
final monthCursorProvider = StateProvider<DateTime>((ref) {
  final now = DateTime.now();
  return DateTime(now.year, now.month);
});

/// The day the user tapped (drives the bottom sheet / right tracker panel).
final selectedDayProvider = StateProvider<DateTime?>((ref) => null);

List<Txn> _txns(Ref ref) {
  final s = ref.watch(transactionListProvider);
  return s is TransactionData ? s.transactions : const <Txn>[];
}

/// Per-day rolled-up ledger for the whole vault, keyed 'YYYY-MM-DD'.
final dayLedgersProvider = Provider<Map<String, DayLedger>>((ref) {
  return ref.watch(calendarAggregatorProvider).aggregateByDay(_txns(ref));
});

/// Transactions on a given day, newest first.
final dayTransactionsProvider =
    Provider.family<List<Txn>, DateTime>((ref, day) {
  final key = CalendarAggregator.dayKey(day);
  final list = _txns(ref)
      .where((t) => CalendarAggregator.dayKey(t.date) == key)
      .toList()
    ..sort((a, b) => b.date.compareTo(a.date));
  return list;
});
