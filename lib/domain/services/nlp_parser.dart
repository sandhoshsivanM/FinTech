import 'package:decimal/decimal.dart';

import '../entities/transaction.dart';

/// Structured result of parsing a free-text quick entry (PRD §14 NLP parser).
class ParsedQuickEntry {
  const ParsedQuickEntry({
    required this.amount,
    required this.type,
    required this.date,
    this.merchant,
    this.categoryHint,
    required this.rawText,
  });

  final Decimal? amount;
  final TxnType type;
  final DateTime date;
  final String? merchant;
  final String? categoryHint; // matched to a category by the caller
  final String rawText;

  bool get isUsable => amount != null;
}

/// Pure-Dart natural-language parser for entries like
/// "spent 450 on groceries at bigbasket yesterday" (PRD §3 domain/services —
/// no Flutter imports; safe to run in an isolate for batch parsing).
class NlpParser {
  const NlpParser();

  static const _incomeWords = {
    'received', 'got', 'earned', 'salary', 'income', 'credited', 'refund',
    'refunded', 'bonus', 'interest', 'dividend',
  };

  static final _amountRe =
      RegExp(r'(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)');
  static final _merchantRe =
      RegExp(r'\b(?:at|from)\s+([a-z0-9][a-z0-9 &._-]*?)(?=\s+(?:on|for|at|from|today|yesterday|tomorrow)\b|$)');
  static final _categoryRe =
      RegExp(r'\b(?:on|for)\s+([a-z0-9][a-z0-9 &._-]*?)(?=\s+(?:on|for|at|from|today|yesterday|tomorrow)\b|$)');

  ParsedQuickEntry parse(String text, {DateTime? now}) {
    final today = now ?? DateTime.now();
    final lower = text.toLowerCase().trim();

    // Amount: first numeric token, commas stripped.
    Decimal? amount;
    final am = _amountRe.firstMatch(lower);
    if (am != null) {
      final raw = am.group(1)!.replaceAll(',', '');
      amount = Decimal.tryParse(raw);
    }

    // Type: income keyword present → income, else expense (default).
    final words = lower.split(RegExp(r'[^a-z]+')).toSet();
    final type = words.intersection(_incomeWords).isNotEmpty
        ? TxnType.income
        : TxnType.expense;

    // Date: relative keywords.
    var date = DateTime(today.year, today.month, today.day);
    if (lower.contains('yesterday')) {
      date = date.subtract(const Duration(days: 1));
    } else if (lower.contains('tomorrow')) {
      date = date.add(const Duration(days: 1));
    }

    final merchant = _clean(_merchantRe.firstMatch(lower)?.group(1));
    final categoryHint = _clean(_categoryRe.firstMatch(lower)?.group(1));

    return ParsedQuickEntry(
      amount: amount,
      type: type,
      date: date,
      merchant: merchant,
      categoryHint: categoryHint,
      rawText: text.trim(),
    );
  }

  static String? _clean(String? s) {
    if (s == null) return null;
    final t = s.trim();
    return t.isEmpty ? null : t;
  }
}
