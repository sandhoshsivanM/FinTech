import 'package:decimal/decimal.dart';

enum BankTxnDirection { debit, credit }

/// A transaction parsed from a bank statement, before reconciliation
/// (PRD §13B StagedTransaction).
class StagedBankTxn {
  StagedBankTxn({
    required this.date,
    required this.description,
    required this.amount,
    required this.direction,
    this.balance,
    this.suggestedCategoryId,
    this.fingerprint,
    this.isDuplicate = false,
  });

  final DateTime date;
  final String description;
  final Decimal amount; // always positive
  final BankTxnDirection direction;
  final Decimal? balance;

  String? suggestedCategoryId; // filled by NLP/alias pass
  String? fingerprint; // filled by the dedup pass
  bool isDuplicate;

  /// PRD §13C: SHA-256( date + amount_string + first_30_chars_of_description ).
  String get fingerprintInput {
    final d = date.toIso8601String().substring(0, 10);
    final desc = description.length > 30
        ? description.substring(0, 30)
        : description;
    return '$d|${amount.toString()}|$desc';
  }
}

/// Parses a bank statement file into staged transactions (PRD §13B).
abstract interface class IBankStatementParser {
  String get bankName;

  /// Maps already-decoded rows (separated from byte-decoding for testing).
  List<StagedBankTxn> parseRows(List<List<String?>> rows);
}

/// Flexible date normalization for Indian bank statement formats (PRD §13A).
abstract final class BankDate {
  /// Tries dd/MM/yy, dd/MM/yyyy, dd-MM-yyyy, dd-MMM-yyyy, yyyy-MM-dd.
  static DateTime? tryParse(String? raw) {
    if (raw == null) return null;
    final s = raw.trim();
    if (s.isEmpty) return null;

    // dd/MM/yy or dd/MM/yyyy or dd-MM-yyyy
    final numeric = RegExp(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$');
    final m = numeric.firstMatch(s);
    if (m != null) {
      var year = int.parse(m.group(3)!);
      if (year < 100) year += 2000;
      return DateTime(year, int.parse(m.group(2)!), int.parse(m.group(1)!));
    }

    // dd-MMM-yyyy (e.g. 05-Jan-2026)
    final monthNames = {
      'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
      'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    };
    final named = RegExp(r'^(\d{1,2})[ -]([A-Za-z]{3})[ -](\d{2,4})$');
    final nm = named.firstMatch(s);
    if (nm != null) {
      final mon = monthNames[nm.group(2)!.toLowerCase()];
      if (mon != null) {
        var year = int.parse(nm.group(3)!);
        if (year < 100) year += 2000;
        return DateTime(year, mon, int.parse(nm.group(1)!));
      }
    }

    // ISO yyyy-MM-dd
    return DateTime.tryParse(s);
  }
}

/// Parses an amount string ("1,234.50", "₹100", "-50.00") to a positive Decimal.
Decimal? parseAmount(String? raw) {
  if (raw == null) return null;
  final cleaned = raw.replaceAll(RegExp(r'[,₹\s]'), '').replaceAll('-', '');
  if (cleaned.isEmpty) return null;
  return Decimal.tryParse(cleaned);
}
