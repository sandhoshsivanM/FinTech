import 'package:decimal/decimal.dart';

import '../entities/transaction.dart';
import 'bank_statement.dart' show BankDate, parseAmount;

/// A localized financial-institution profile used to recognize the sender of an
/// SMS / push notification. Keeping this as data (not code) lets the registry
/// grow without touching the parser (PRD §13 import profiles).
class BankProfile {
  const BankProfile({
    required this.id,
    required this.name,
    required this.senderKeywords,
  });

  final String id;
  final String name;
  final List<String> senderKeywords; // matched against sender / message body
}

/// Default Indian bank/UPI sender profiles. Add more without code changes.
const List<BankProfile> defaultBankProfiles = [
  BankProfile(id: 'hdfc', name: 'HDFC Bank', senderKeywords: ['hdfc']),
  BankProfile(id: 'icici', name: 'ICICI Bank', senderKeywords: ['icici']),
  BankProfile(id: 'sbi', name: 'State Bank of India', senderKeywords: ['sbi']),
  BankProfile(id: 'axis', name: 'Axis Bank', senderKeywords: ['axis']),
  BankProfile(id: 'kotak', name: 'Kotak Mahindra Bank', senderKeywords: ['kotak']),
];

/// The normalized output of parsing one message — the *only* thing that leaves
/// the parser. The raw message text is never returned or stored (zero-telemetry
/// privacy boundary). Output contract: a text timestamp, a Decimal amount, a
/// merchant string, and a fallback "uncategorized" flag.
class ParsedNotification {
  const ParsedNotification({
    required this.timestamp,
    required this.amount,
    required this.merchant,
    required this.uncategorized,
    required this.type,
    this.profileId,
  });

  final String timestamp; // 'YYYY-MM-DD'
  final Decimal amount; // always positive; sign comes from [type]
  final String merchant; // '' when none could be extracted
  final bool uncategorized; // true when there's no signal to auto-categorize
  final TxnType type; // debit → expense, credit → income
  final String? profileId; // matched bank profile, null if generic

  /// SHA-256 dedup input (same scheme as bank import) — hashed by the caller.
  String get fingerprintInput => '$timestamp|${amount.toString()}|$merchant';
}

/// Pure-Dart offline parser for bank transaction SMS / push notifications
/// (PRD §3 domain/services — no Flutter/IO imports; runs entirely in memory).
/// Mirrored in webapp/src/domain/notificationParser.ts.
class NotificationParser {
  const NotificationParser({this.profiles = defaultBankProfiles});

  final List<BankProfile> profiles;

  static const _debitWords = [
    'debited', 'spent', 'withdrawn', 'paid', 'purchase', 'debit',
  ];
  static const _creditWords = [
    'credited', 'received', 'deposited', 'refunded', 'refund', 'credit',
  ];

  // Amounts must carry a currency token so we never mistake an account number,
  // card suffix or date for the amount.
  static final _amountRe =
      RegExp(r'(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)');
  // Strip the balance figure so it is never read as the transaction amount.
  static final _balanceRe = RegExp(
      r'(?:available\s+balance|avl\.?\s*bal(?:ance)?|a/c\s*bal(?:ance)?|bal(?:ance)?)\s*:?\s*(?:rs\.?|inr|₹)?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?');
  static final _merchantRe = RegExp(
      r'(?:\btowards|\bvpa|\bat|\bto)\s+([a-z0-9][a-z0-9 &@_-]*?)\s*(?:[.,]|\bon\b|\bvia\b|\bref\b|\btxn\b|\bavl\b|\busing\b|\binfo\b|$)');
  static final _dateRe = RegExp(
      r'\bon\s+(\d{1,2}[-/][A-Za-z0-9]{2,3}[-/]\d{2,4}|\d{4}-\d{2}-\d{2})');

  /// Parses [raw] into a [ParsedNotification], or null if it isn't a
  /// recognizable financial transaction message.
  ParsedNotification? parse(String raw, {DateTime? now, String? sender}) {
    final at = now ?? DateTime.now();
    final lower = raw.toLowerCase();

    final hasDebit = _debitWords.any(lower.contains);
    final hasCredit = _creditWords.any(lower.contains);
    if (!hasDebit && !hasCredit) return null;
    final type = hasDebit ? TxnType.expense : TxnType.income;

    final cleaned = lower.replaceAll(_balanceRe, ' ');
    final am = _amountRe.firstMatch(cleaned);
    if (am == null) return null;
    final amount = parseAmount(am.group(1));
    if (amount == null) return null;

    final merchant = _merchant(lower);

    final dm = _dateRe.firstMatch(lower);
    final date = (dm != null ? BankDate.tryParse(dm.group(1)) : null) ?? at;

    return ParsedNotification(
      timestamp: _ymd(date),
      amount: amount,
      merchant: merchant ?? '',
      uncategorized: merchant == null,
      type: type,
      profileId: _matchProfile(lower, sender)?.id,
    );
  }

  String? _merchant(String lower) {
    final m = _merchantRe.firstMatch(lower);
    final raw = m?.group(1)?.trim();
    return (raw == null || raw.isEmpty) ? null : raw;
  }

  BankProfile? _matchProfile(String lower, String? sender) {
    final s = sender?.toLowerCase();
    for (final p in profiles) {
      for (final kw in p.senderKeywords) {
        if (s != null && s.contains(kw)) return p;
        if (lower.contains(kw)) return p;
      }
    }
    return null;
  }

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}
