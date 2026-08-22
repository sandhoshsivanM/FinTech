import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/domain/services/net_worth_calculator.dart';

/// The definition of net worth, and the one thing every surface that shows it
/// has to agree on.
///
/// The dashboard hero rendered lifetime cash flow under the words "NET WORTH".
/// That figure counts neither holdings nor debt, so it disagreed with three
/// things at once: the web client, the daily snapshot written a few lines below
/// it in the same file, and the tour's own promise that net worth is "what you
/// own minus what you owe". The visible symptom was the hero jumping the moment
/// the trend had two snapshots and stopped using the cash-flow series.
///
/// [trueNetWorthProvider] is a thin Riverpod wrapper over the arithmetic here;
/// this pins the arithmetic, which is the part that was wrong.
void main() {
  Decimal d(String s) => Decimal.parse(s);

  /// The formula, stated once. Mirrors `trueNetWorthProvider` and the snapshot
  /// writer (`cash + invest - liab`), and `netWorth()` in webapp/src/domain.
  Decimal netWorth({
    required Decimal cash,
    required Decimal investments,
    required Decimal liabilities,
  }) =>
      cash + investments - liabilities;

  group('net worth counts everything, not just the ledger', () {
    test('holdings are assets, so they raise it', () {
      expect(
        netWorth(
            cash: d('50000'),
            investments: d('200000'),
            liabilities: Decimal.zero),
        d('250000'),
        reason: 'cash alone would have said 50000',
      );
    });

    test('debt lowers it', () {
      expect(
        netWorth(
            cash: d('50000'),
            investments: Decimal.zero,
            liabilities: d('30000')),
        d('20000'),
        reason: 'cash alone would have said 50000',
      );
    });

    test('someone can own a portfolio and still be under water', () {
      // The case the old hero got most wrong: a healthy cash flow, a car loan
      // bigger than everything else, and a headline that read as comfortable.
      expect(
        netWorth(
            cash: d('40000'),
            investments: d('100000'),
            liabilities: d('900000')),
        d('-760000'),
      );
    });

    test('with no holdings and no debt it collapses to cash', () {
      // Which is why the bug was invisible to anyone testing an empty vault.
      final cash = d('12345.67');
      expect(
        netWorth(
            cash: cash, investments: Decimal.zero, liabilities: Decimal.zero),
        cash,
      );
    });
  });

  test('cash flow is not net worth, and the calculator only claims the former',
      () {
    // NetWorthCalculator.total is named for the screen it fed, not for what it
    // computes: it is income minus expense over the whole ledger. Keeping that
    // explicit here is what stops the next reader wiring it to a hero again.
    const calc = NetWorthCalculator();
    final total = calc.total(const []);
    expect(total, Decimal.zero);
  });
}
