import 'package:decimal/decimal.dart';
import 'package:khazana/core/utils/money_format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Decimal d(String s) => Decimal.parse(s);

  group('toWords (PRD §10A: currency read as words)', () {
    test('ten thousand', () {
      expect(Money.toWords(d('10000')), 'ten thousand rupees');
    });
    test('singular rupee', () {
      expect(Money.toWords(d('1')), 'one rupee');
    });
    test('zero', () {
      expect(Money.toWords(d('0')), 'zero rupees');
    });
    test('Indian lakh grouping', () {
      expect(Money.toWords(d('125000')),
          'one lakh twenty-five thousand rupees');
    });
    test('crore', () {
      expect(Money.toWords(d('12500000')),
          'one crore twenty-five lakh rupees');
    });
    test('with paise', () {
      expect(Money.toWords(d('10000.50')), 'ten thousand rupees and fifty paise');
    });
    test('negative', () {
      expect(Money.toWords(d('-200')), startsWith('minus '));
    });
  });

  group('format (Indian grouping)', () {
    test('groups in lakhs', () {
      // en_IN groups as 1,00,000
      expect(Money.format(d('100000')), '₹1,00,000.00');
    });
    test('signed', () {
      expect(Money.formatSigned(d('500'), isIncome: true), startsWith('+'));
      expect(Money.formatSigned(d('500'), isIncome: false), startsWith('-'));
    });
  });
}
