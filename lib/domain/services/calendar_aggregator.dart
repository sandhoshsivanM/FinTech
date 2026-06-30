import 'package:decimal/decimal.dart';

import '../entities/transaction.dart';

/// One calendar day's rolled-up ledger. Money stays Decimal so totals never
/// drift by a rounding cent (PRD §2).
class DayLedger {
  const DayLedger({
    required this.date,
    required this.income,
    required this.expense,
    required this.txnIds,
    required this.hasAttachment,
  });

  final String date; // 'YYYY-MM-DD'
  final Decimal income;
  final Decimal expense;
  final List<String> txnIds;
  final bool hasAttachment; // any txn that day carries a receipt attachment

  Decimal get net => income - expense;
}

/// Pure-Dart per-day aggregation for the calendar ledger (PRD §3 domain/services
/// — no Flutter imports). Mirrored in webapp/src/domain/calendarLedger.ts.
///
/// Date-key convention: the transaction's *local* calendar day, formatted
/// 'YYYY-MM-DD'. The web mirror reads epoch-ms with local components, so both
/// engines produce the same keys for the same instants.
class CalendarAggregator {
  const CalendarAggregator();

  Map<String, DayLedger> aggregateByDay(List<Txn> txns) {
    final income = <String, Decimal>{};
    final expense = <String, Decimal>{};
    final ids = <String, List<String>>{};
    final attach = <String, bool>{};
    final keys = <String>{};

    for (final t in txns) {
      final k = _ymd(t.date);
      keys.add(k);
      ids.putIfAbsent(k, () => <String>[]).add(t.id);
      if (t.type == TxnType.income) {
        income[k] = (income[k] ?? Decimal.zero) + t.amount;
      } else {
        expense[k] = (expense[k] ?? Decimal.zero) + t.amount;
      }
      if (t.attachmentRef != null) attach[k] = true;
    }

    final out = <String, DayLedger>{};
    for (final k in keys.toList()..sort()) {
      out[k] = DayLedger(
        date: k,
        income: income[k] ?? Decimal.zero,
        expense: expense[k] ?? Decimal.zero,
        txnIds: ids[k] ?? const <String>[],
        hasAttachment: attach[k] ?? false,
      );
    }
    return out;
  }

  /// The 'YYYY-MM-DD' local-day key for [d] (matches the aggregation keys).
  static String dayKey(DateTime d) => _ymd(d);

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}
