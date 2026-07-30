import 'package:decimal/decimal.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/domain/services/calendar_aggregator.dart';
import 'package:flutter_test/flutter_test.dart';

// Parity fixtures shared with webapp/src/domain/calendarLedger.test.ts. Times
// are pinned to local noon so day keys are deterministic across engines.
void main() {
  const agg = CalendarAggregator();

  Txn txn(String id, String amount, TxnType type, DateTime date, {String? attach}) =>
      Txn(
        id: id, vaultId: 'v', amount: Decimal.parse(amount), type: type,
        categoryId: 'c', date: date, createdAt: date, attachmentRef: attach,
      );

  final d10 = DateTime(2026, 6, 10, 12);
  final d11 = DateTime(2026, 6, 11, 12);

  test('groups by local day, sums income/expense, keeps net as Decimal', () {
    final m = agg.aggregateByDay([
      txn('a', '100', TxnType.expense, d10, attach: 'r1'),
      txn('b', '500', TxnType.income, d10),
      txn('c', '50', TxnType.expense, d11),
    ]);

    expect(m.length, 2);
    expect(m.keys.toList(), ['2026-06-10', '2026-06-11']);

    final day10 = m['2026-06-10']!;
    expect(day10.income, Decimal.parse('500'));
    expect(day10.expense, Decimal.parse('100'));
    expect(day10.net, Decimal.parse('400'));
    expect(day10.txnIds, ['a', 'b']);
    expect(day10.hasAttachment, isTrue);

    final day11 = m['2026-06-11']!;
    expect(day11.income, Decimal.zero);
    expect(day11.net, Decimal.parse('-50'));
    expect(day11.hasAttachment, isFalse);
  });

  test('empty input → empty map', () {
    expect(agg.aggregateByDay(const []), isEmpty);
  });
}
