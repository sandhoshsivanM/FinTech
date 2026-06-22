import 'dart:convert';
import 'dart:typed_data';

import 'package:csv/csv.dart';
import 'package:decimal/decimal.dart';

import '../../core/errors/app_error.dart';
import '../../domain/services/bank_statement.dart';

/// Decodes CSV bytes to string rows.
List<List<String?>> decodeCsv(Uint8List bytes) {
  final text = utf8.decode(bytes, allowMalformed: true);
  return const CsvToListConverter(shouldParseNumbers: false)
      .convert(text)
      .map((r) => r.map((c) => c?.toString()).toList())
      .toList();
}

/// Finds the header row index whose cells contain all [keywords] (lowercased).
int findHeader(List<List<String?>> rows, List<String> keywords) {
  return rows.indexWhere((row) {
    final joined = row.map((c) => (c ?? '').toLowerCase()).join('|');
    return keywords.every(joined.contains);
  });
}

int colWith(List<String?> header, List<String> anyOf) {
  final h = header.map((c) => (c ?? '').toLowerCase()).toList();
  return h.indexWhere((c) => anyOf.any(c.contains));
}

String? cell(List<String?> row, int i) =>
    (i >= 0 && i < row.length) ? row[i] : null;

/// HDFC: DD/MM/YY dates, separate Debit and Credit columns (PRD §13A).
class HdfcCsvParser implements IBankStatementParser {
  const HdfcCsvParser();
  @override
  String get bankName => 'HDFC Bank';

  @override
  List<StagedBankTxn> parseRows(List<List<String?>> rows) {
    final hi = findHeader(rows, ['date', 'narration']);
    if (hi < 0) throw const ImportError("This file doesn't match HDFC format.");
    final header = rows[hi];
    final dateCol = colWith(header, ['date']);
    final descCol = colWith(header, ['narration', 'description']);
    final debitCol = colWith(header, ['withdrawal', 'debit']);
    final creditCol = colWith(header, ['deposit', 'credit']);
    final balCol = colWith(header, ['balance']);

    final out = <StagedBankTxn>[];
    for (var i = hi + 1; i < rows.length; i++) {
      final row = rows[i];
      final date = BankDate.tryParse(cell(row, dateCol));
      if (date == null) continue;
      final debit = parseAmount(cell(row, debitCol));
      final credit = parseAmount(cell(row, creditCol));
      final isCredit = (credit ?? Decimal.zero) > Decimal.zero;
      final amount = isCredit ? credit : debit;
      if (amount == null || amount == Decimal.zero) continue;
      out.add(StagedBankTxn(
        date: date,
        description: (cell(row, descCol) ?? '').trim(),
        amount: amount,
        direction: isCredit ? BankTxnDirection.credit : BankTxnDirection.debit,
        balance: parseAmount(cell(row, balCol)),
      ));
    }
    return out;
  }
}

/// ICICI: narration holds the full merchant string (NLP-friendly) (PRD §13A).
class IciciCsvParser implements IBankStatementParser {
  const IciciCsvParser();
  @override
  String get bankName => 'ICICI Bank';

  @override
  List<StagedBankTxn> parseRows(List<List<String?>> rows) {
    final hi = findHeader(rows, ['date', 'amount']);
    if (hi < 0) throw const ImportError("This file doesn't match ICICI format.");
    final header = rows[hi];
    final dateCol = colWith(header, ['transaction date', 'value date', 'date']);
    final descCol = colWith(header, ['transaction remarks', 'remarks', 'narration', 'description']);
    final debitCol = colWith(header, ['withdrawal', 'debit']);
    final creditCol = colWith(header, ['deposit', 'credit']);

    final out = <StagedBankTxn>[];
    for (var i = hi + 1; i < rows.length; i++) {
      final row = rows[i];
      final date = BankDate.tryParse(cell(row, dateCol));
      if (date == null) continue;
      final debit = parseAmount(cell(row, debitCol));
      final credit = parseAmount(cell(row, creditCol));
      final isCredit = (credit ?? Decimal.zero) > Decimal.zero;
      final amount = isCredit ? credit : debit;
      if (amount == null || amount == Decimal.zero) continue;
      out.add(StagedBankTxn(
        date: date,
        description: (cell(row, descCol) ?? '').trim(),
        amount: amount,
        direction: isCredit ? BankTxnDirection.credit : BankTxnDirection.debit,
      ));
    }
    return out;
  }
}

/// SBI: single amount column, positive = credit, negative = debit (PRD §13A).
class SbiCsvParser implements IBankStatementParser {
  const SbiCsvParser();
  @override
  String get bankName => 'SBI';

  @override
  List<StagedBankTxn> parseRows(List<List<String?>> rows) {
    final hi = findHeader(rows, ['date', 'amount']);
    if (hi < 0) throw const ImportError("This file doesn't match SBI format.");
    final header = rows[hi];
    final dateCol = colWith(header, ['txn date', 'date']);
    final descCol = colWith(header, ['description', 'narration', 'details']);
    final amtCol = colWith(header, ['amount']);

    final out = <StagedBankTxn>[];
    for (var i = hi + 1; i < rows.length; i++) {
      final row = rows[i];
      final date = BankDate.tryParse(cell(row, dateCol));
      if (date == null) continue;
      final raw = (cell(row, amtCol) ?? '').trim();
      final amount = parseAmount(raw);
      if (amount == null || amount == Decimal.zero) continue;
      final isCredit = !raw.contains('-');
      out.add(StagedBankTxn(
        date: date,
        description: (cell(row, descCol) ?? '').trim(),
        amount: amount,
        direction: isCredit ? BankTxnDirection.credit : BankTxnDirection.debit,
      ));
    }
    return out;
  }
}

/// Axis: two header rows before data — both are skipped by header detection
/// (PRD §13A). Separate debit/credit columns.
class AxisCsvParser implements IBankStatementParser {
  const AxisCsvParser();
  @override
  String get bankName => 'Axis Bank';

  @override
  List<StagedBankTxn> parseRows(List<List<String?>> rows) {
    final hi = findHeader(rows, ['date']);
    if (hi < 0) throw const ImportError("This file doesn't match Axis format.");
    final header = rows[hi];
    final dateCol = colWith(header, ['tran date', 'transaction date', 'date']);
    final descCol = colWith(header, ['particulars', 'narration', 'description']);
    final debitCol = colWith(header, ['debit', 'withdrawal']);
    final creditCol = colWith(header, ['credit', 'deposit']);

    final out = <StagedBankTxn>[];
    for (var i = hi + 1; i < rows.length; i++) {
      final row = rows[i];
      final date = BankDate.tryParse(cell(row, dateCol));
      if (date == null) continue;
      final debit = parseAmount(cell(row, debitCol));
      final credit = parseAmount(cell(row, creditCol));
      final isCredit = (credit ?? Decimal.zero) > Decimal.zero;
      final amount = isCredit ? credit : debit;
      if (amount == null || amount == Decimal.zero) continue;
      out.add(StagedBankTxn(
        date: date,
        description: (cell(row, descCol) ?? '').trim(),
        amount: amount,
        direction: isCredit ? BankTxnDirection.credit : BankTxnDirection.debit,
      ));
    }
    return out;
  }
}

/// Supported banks (PRD §13A). 'Other' / Kotak PDF handled in Phase 4.
enum SupportedBank {
  hdfc('HDFC Bank'),
  icici('ICICI Bank'),
  sbi('SBI'),
  axis('Axis Bank');

  const SupportedBank(this.label);
  final String label;

  IBankStatementParser get parser => switch (this) {
        SupportedBank.hdfc => const HdfcCsvParser(),
        SupportedBank.icici => const IciciCsvParser(),
        SupportedBank.sbi => const SbiCsvParser(),
        SupportedBank.axis => const AxisCsvParser(),
      };
}
