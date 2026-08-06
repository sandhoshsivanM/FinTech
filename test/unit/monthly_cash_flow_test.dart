import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/domain/services/monthly_cash_flow.dart';

/// Rolling the ledger into months for the cash-flow bars.
///
/// The dashboard and Reports both showed income and expense as two totals for a
/// window. Two numbers answer "how much"; only a run of months answers "is that
/// more than usual", which is the question people actually bring to a
/// dashboard.
void main() {
  Txn txn(String amount, TxnType type, DateTime date) => Txn(
        id: '$date-$amount-${type.name}',
        vaultId: 'v1',
        amount: Decimal.parse(amount),
        type: type,
        categoryId: 'c1',
        date: date,
        createdAt: date,
      );

  final now = DateTime(2026, 8, 15);

  test('returns exactly the months asked for, oldest first', () {
    final flows = MonthlyCashFlow.lastMonths(const [], months: 6, now: now);
    expect(flows, hasLength(6));
    expect(flows.first.month, 3);
    expect(flows.first.year, 2026);
    expect(flows.last.month, 8);
    expect(flows.last.year, 2026);
  });

  test('a month with no transactions is kept as zero, not dropped', () {
    // A bar chart that omits an empty month spaces the remaining bars evenly
    // and turns a gap in the data into a continuous history — the one reading
    // it must not support.
    final flows = MonthlyCashFlow.lastMonths(
      [txn('1000', TxnType.expense, DateTime(2026, 8, 2))],
      months: 3,
      now: now,
    );
    expect(flows, hasLength(3));
    expect(flows[0].expense, Decimal.zero);
    expect(flows[1].expense, Decimal.zero);
    expect(flows[2].expense, Decimal.parse('1000'));
  });

  test('income and expense are summed separately within a month', () {
    final flows = MonthlyCashFlow.lastMonths(
      [
        txn('90000', TxnType.income, DateTime(2026, 8, 1)),
        txn('450', TxnType.expense, DateTime(2026, 8, 3)),
        txn('120', TxnType.expense, DateTime(2026, 8, 4)),
      ],
      months: 1,
      now: now,
    );
    expect(flows.single.income, Decimal.parse('90000'));
    expect(flows.single.expense, Decimal.parse('570'));
    expect(flows.single.net, Decimal.parse('89430'));
  });

  test('transactions outside the window are excluded', () {
    final flows = MonthlyCashFlow.lastMonths(
      [
        txn('500', TxnType.expense, DateTime(2026, 1, 5)), // too old
        txn('700', TxnType.expense, DateTime(2026, 8, 5)),
      ],
      months: 3,
      now: now,
    );
    final total =
        flows.fold(Decimal.zero, (s, f) => s + f.expense);
    expect(total, Decimal.parse('700'));
  });

  test('a window crossing new year is ordered correctly, not by month number',
      () {
    // Keyed on year*12+month rather than the month alone, so December does not
    // sort after January of the following year.
    final flows = MonthlyCashFlow.lastMonths(
      const [],
      months: 3,
      now: DateTime(2026, 1, 20),
    );
    expect(flows.map((f) => '${f.year}-${f.month}').toList(),
        ['2025-11', '2025-12', '2026-1']);
  });

  test('labels carry the year only when the window spans one', () {
    final within =
        MonthlyCashFlow.lastMonths(const [], months: 3, now: DateTime(2026, 8));
    expect(MonthlyCashFlow.spansYears(within), isFalse);
    expect(within.last.label(), 'Aug');

    final across =
        MonthlyCashFlow.lastMonths(const [], months: 3, now: DateTime(2026, 1));
    expect(MonthlyCashFlow.spansYears(across), isTrue);
    expect(across.first.label(withYear: true), 'Nov ’25');
  });

  test('a transaction on the first instant of the window is included', () {
    // Off-by-one at the boundary silently drops a whole month's opening day.
    final flows = MonthlyCashFlow.lastMonths(
      [txn('100', TxnType.expense, DateTime(2026, 6, 1))],
      months: 3,
      now: now,
    );
    expect(flows.first.month, 6);
    expect(flows.first.expense, Decimal.parse('100'));
  });
}
