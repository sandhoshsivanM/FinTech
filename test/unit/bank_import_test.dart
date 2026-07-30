import 'package:decimal/decimal.dart';
import 'package:khazana/domain/services/bank_fingerprint.dart';
import 'package:khazana/domain/services/bank_statement.dart';
import 'package:khazana/features/import/bank_parsers.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('BankDate.tryParse', () {
    test('dd/MM/yy (HDFC)', () {
      expect(BankDate.tryParse('05/01/26'), DateTime(2026, 1, 5));
    });
    test('dd-MM-yyyy', () {
      expect(BankDate.tryParse('05-01-2026'), DateTime(2026, 1, 5));
    });
    test('dd-MMM-yyyy', () {
      expect(BankDate.tryParse('05-Jan-2026'), DateTime(2026, 1, 5));
    });
  });

  group('HDFC parser (separate debit/credit columns)', () {
    test('maps debit and credit rows with direction', () {
      final rows = <List<String?>>[
        ['Date', 'Narration', 'Withdrawal Amt', 'Deposit Amt', 'Closing Balance'],
        ['05/01/26', 'UPI BIGBASKET', '450.00', '', '9550.00'],
        ['06/01/26', 'SALARY CREDIT', '', '50000.00', '59550.00'],
      ];
      final out = const HdfcCsvParser().parseRows(rows);
      expect(out.length, 2);
      expect(out[0].direction, BankTxnDirection.debit);
      expect(out[0].amount, Decimal.parse('450.00'));
      expect(out[1].direction, BankTxnDirection.credit);
      expect(out[1].amount, Decimal.parse('50000.00'));
    });
  });

  group('SBI parser (single signed amount column)', () {
    test('negative = debit, positive = credit', () {
      final rows = <List<String?>>[
        ['Txn Date', 'Description', 'Amount'],
        ['05-01-2026', 'ATM WDL', '-2000.00'],
        ['06-01-2026', 'INTEREST', '125.50'],
      ];
      final out = const SbiCsvParser().parseRows(rows);
      expect(out[0].direction, BankTxnDirection.debit);
      expect(out[1].direction, BankTxnDirection.credit);
    });
  });

  group('Axis parser (skips preamble rows before header)', () {
    test('finds header below two preamble rows', () {
      final rows = <List<String?>>[
        ['Axis Bank Statement', null, null, null],
        ['Account: XXXX', null, null, null],
        ['Tran Date', 'Particulars', 'Debit', 'Credit'],
        ['05-01-2026', 'NEFT RENT', '15000', ''],
      ];
      final out = const AxisCsvParser().parseRows(rows);
      expect(out.single.amount, Decimal.parse('15000'));
      expect(out.single.direction, BankTxnDirection.debit);
    });
  });

  group('fingerprint dedup (PRD §13C)', () {
    test('same date+amount+desc → identical fingerprint', () async {
      final a = StagedBankTxn(
          date: DateTime(2026, 1, 5),
          description: 'UPI BIGBASKET PAYMENT 12345',
          amount: Decimal.parse('450.00'),
          direction: BankTxnDirection.debit);
      final b = StagedBankTxn(
          date: DateTime(2026, 1, 5),
          description: 'UPI BIGBASKET PAYMENT 12345',
          amount: Decimal.parse('450.00'),
          direction: BankTxnDirection.debit);
      expect(await BankFingerprint.compute(a.fingerprintInput),
          await BankFingerprint.compute(b.fingerprintInput));
    });

    test('different amount → different fingerprint', () async {
      final a = StagedBankTxn(
          date: DateTime(2026, 1, 5),
          description: 'UPI BIGBASKET',
          amount: Decimal.parse('450.00'),
          direction: BankTxnDirection.debit);
      final b = StagedBankTxn(
          date: DateTime(2026, 1, 5),
          description: 'UPI BIGBASKET',
          amount: Decimal.parse('451.00'),
          direction: BankTxnDirection.debit);
      expect(await BankFingerprint.compute(a.fingerprintInput),
          isNot(await BankFingerprint.compute(b.fingerprintInput)));
    });

    test('fingerprint is 64-hex SHA-256', () async {
      final fp = await BankFingerprint.compute('2026-01-05|450.00|test');
      expect(fp.length, 64);
      expect(RegExp(r'^[0-9a-f]+$').hasMatch(fp), isTrue);
    });
  });
}
