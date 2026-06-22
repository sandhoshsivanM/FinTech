import 'package:decimal/decimal.dart';
import 'package:fintech_os/domain/services/currency_converter.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const conv = CurrencyConverter();
  Decimal d(String s) => Decimal.parse(s);

  test('toBase multiplies foreign amount by the base-per-foreign rate', () {
    // 100 USD × 83 (INR per USD) = 8300 INR
    expect(conv.toBase(d('100'), d('83')), d('8300'));
  });

  test('netWorth sums base-currency amounts directly', () {
    final r = conv.netWorth(
      [Money2(d('1000'), 'INR'), Money2(d('500'), 'INR')],
      'INR',
      (_) => null,
    );
    expect(r.total, d('1500'));
    expect(r.missingRates, isEmpty);
  });

  test('netWorth converts foreign amounts and tracks per-currency subtotals', () {
    final r = conv.netWorth(
      [Money2(d('1000'), 'INR'), Money2(d('100'), 'USD')],
      'INR',
      (c) => c == 'USD' ? d('83') : null,
    );
    expect(r.total, d('9300')); // 1000 + 100×83
    expect(r.perCurrency['USD'], d('8300'));
  });

  test('missing rate is reported, not silently zeroed (PRD §12D step 3)', () {
    final r = conv.netWorth(
      [Money2(d('1000'), 'INR'), Money2(d('100'), 'AED')],
      'INR',
      (_) => null, // no rate
    );
    expect(r.total, d('1000'));
    expect(r.missingRates, {'AED'});
  });
}
