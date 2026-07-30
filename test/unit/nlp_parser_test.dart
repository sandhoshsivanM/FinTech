import 'package:decimal/decimal.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/domain/services/nlp_parser.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const parser = NlpParser();
  final now = DateTime(2026, 6, 22, 10);

  test('parses amount, category and merchant', () {
    final r = parser.parse('spent 450 on groceries at bigbasket', now: now);
    expect(r.amount, Decimal.parse('450'));
    expect(r.type, TxnType.expense);
    expect(r.categoryHint, 'groceries');
    expect(r.merchant, 'bigbasket');
  });

  test('income keywords flip the type', () {
    final r = parser.parse('received salary 50000', now: now);
    expect(r.type, TxnType.income);
    expect(r.amount, Decimal.parse('50000'));
  });

  test('default type is expense', () {
    final r = parser.parse('1200 electricity bill', now: now);
    expect(r.type, TxnType.expense);
    expect(r.amount, Decimal.parse('1200'));
  });

  test('strips currency symbols and thousands separators', () {
    final r = parser.parse('paid ₹1,25,000 for rent', now: now);
    expect(r.amount, Decimal.parse('125000'));
    expect(r.categoryHint, 'rent');
  });

  test('handles decimals', () {
    final r = parser.parse('spent 99.50 on coffee', now: now);
    expect(r.amount, Decimal.parse('99.50'));
  });

  test('relative date: yesterday', () {
    final r = parser.parse('spent 200 on lunch yesterday', now: now);
    expect(r.date, DateTime(2026, 6, 21));
  });

  test('relative date: tomorrow', () {
    final r = parser.parse('paid 500 for tickets tomorrow', now: now);
    expect(r.date, DateTime(2026, 6, 23));
  });

  test('defaults to today when no date keyword', () {
    final r = parser.parse('spent 80 on tea', now: now);
    expect(r.date, DateTime(2026, 6, 22));
  });

  test('no amount → not usable', () {
    final r = parser.parse('groceries at bigbasket', now: now);
    expect(r.amount, isNull);
    expect(r.isUsable, isFalse);
  });

  test('from is treated like at for merchant', () {
    final r = parser.parse('got 1000 from freelance work', now: now);
    expect(r.merchant, isNotNull);
    expect(r.type, TxnType.income);
  });
}
