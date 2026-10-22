import 'package:decimal/decimal.dart';

import '../entities/capture_types.dart';
import '../entities/transaction.dart';
import 'bank_statement.dart' show BankDate, parseAmount;

export '../entities/capture_types.dart' show CaptureInstrument, CaptureKind;

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
/// privacy boundary).
class ParsedNotification {
  const ParsedNotification({
    required this.timestamp,
    required this.amount,
    required this.merchant,
    required this.uncategorized,
    required this.type,
    this.profileId,
    this.utr,
    this.accountLast4,
    this.availableBalance,
    this.instrument = CaptureInstrument.unknown,
    this.kind = CaptureKind.spend,
  });

  final String timestamp; // 'YYYY-MM-DD'
  final Decimal amount; // always positive; sign comes from [type]
  final String merchant; // '' when none could be extracted
  final bool uncategorized; // true when there's no signal to auto-categorize
  final TxnType type; // debit → expense, credit → income
  final String? profileId; // matched bank profile, null if generic

  /// UPI / IMPS reference (12 digits) or NEFT UTR (alphanumeric), uppercased.
  /// Unique per transaction, so it is the strongest dedupe key there is.
  final String? utr;

  /// Last digits of the masked account or card number ("XX1234" → "1234").
  /// Three digits when that is all the bank prints.
  final String? accountLast4;

  /// The "Avl Bal" figure after this transaction. Never a credit-card limit.
  final Decimal? availableBalance;

  final CaptureInstrument instrument;
  final CaptureKind kind;

  /// Dedupe key input (hashed or compared by the caller).
  ///
  /// A reference number identifies one transaction exactly, so it wins. The
  /// direction is part of the key because a transfer between two of the user's
  /// own accounts produces a debit alert and a credit alert with the *same*
  /// reference — both legs are real and neither may swallow the other.
  ///
  /// Without a reference, the available balance is what tells two genuinely
  /// identical spends apart (two ₹150 coffees leave two different balances),
  /// while a re-delivered copy of one alert carries the same balance and still
  /// collapses to a single key.
  String get fingerprintInput {
    if (utr != null) return 'utr|$utr|${type.name}';
    return '$timestamp|${amount.toString()}|$merchant'
        '|${accountLast4 ?? ''}|${availableBalance?.toString() ?? ''}';
  }
}

/// Pure-Dart offline parser for bank transaction SMS / push notifications
/// (PRD §3 domain/services — no Flutter/IO imports; runs entirely in memory).
/// Mirrored in packages/domain-ts/src/notificationParser.ts; both are pinned by
/// test/fixtures/parser_cases.json.
///
/// Every pattern below runs on text that has been length-capped and had its
/// whitespace collapsed to single spaces. That is a security property, not
/// tidiness: the notification listener sees every app's notifications, so the
/// input is attacker-controlled, and adjacent `\s*` groups over a long run of
/// spaces backtrack polynomially (ReDoS) on the UI isolate.
class NotificationParser {
  const NotificationParser({this.profiles = defaultBankProfiles});

  final List<BankProfile> profiles;

  /// Longer than any bank alert; anything bigger is not one.
  static const maxLength = 2000;

  static const _debitWords = [
    'debited', 'spent', 'withdrawn', 'paid', 'purchase', 'debit', 'sent',
  ];
  static const _creditWords = [
    'credited', 'received', 'deposited', 'refunded', 'refund', 'credit',
  ];

  static final _whitespaceRe = RegExp(r'\s+');

  // "credit card" / "debit card" name a product, not a direction. Removed before
  // the debit/credit decision so "refund credited to your debit card" is income.
  static final _cardPhraseRe = RegExp(r'\b(?:credit|debit) card\b');

  static final _otpRe =
      RegExp(r'\botp\b|one[ -]time password|verification code');
  static final _failedRe = RegExp(
      r'\b(?:declined|failed|unsuccessful|not processed|could not be processed)\b');
  static final _promoRe = RegExp(
      r'\b(?:pre-?approved|eligible|apply now|apply today|up ?to|limited period|offer|congratulations|instant loan|personal loan)\b');
  static final _refundRe = RegExp(r'\b(?:refund|refunded|reversed|reversal)\b');
  static final _paymentRe = RegExp(r'\bpayment\b');

  // Amounts must carry a currency token so we never mistake an account number,
  // card suffix or date for the amount.
  static final _amountRe =
      RegExp(r'(?:rs\.?|inr|₹) ?([0-9][0-9,]*(?:\.[0-9]{1,2})?)');
  // SBI writes "debited by 120.0" with no currency token at all.
  static final _bareAmountRe = RegExp(
      r'\b(?:debited|credited) (?:by|with|for) ([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b');
  // Stripped so they are never read as the transaction amount. A card's
  // available *limit* is stripped too, but is not a balance.
  static final _balanceRe = RegExp(
      r'(?:available balance|avl\.? ?bal(?:ance)?|a/c bal(?:ance)?|\bbal(?:ance)?) ?(?:is )?:? ?(?:rs\.?|inr|₹)? ?([0-9][0-9,]*(?:\.[0-9]{1,2})?)');
  static final _limitRe = RegExp(
      r'(?:avl\.? ?(?:lmt|limit)|available (?:credit )?limit) ?:? ?(?:rs\.?|inr|₹)? ?[0-9][0-9,]*(?:\.[0-9]{1,2})?');
  static final _merchantRe = RegExp(
      r'(?:\btowards|\bvpa|\bat|\bto) ([a-z0-9][a-z0-9 &@_-]*?) ?(?:[.,(]|\bon\b|\bvia\b|\bref|\btxn\b|\bavl\b|\busing\b|\binfo\b|\bfrom\b|$)');
  static final _dateRe = RegExp(
      r'\bon (\d{1,2}[-/][A-Za-z0-9]{2,3}[-/]\d{2,4}|\d{4}-\d{2}-\d{2})');

  // A reference only counts after a keyword: a bare 12-digit run is as likely
  // to be a mobile number with its country code (91XXXXXXXXXX).
  static final _utrRe = RegExp(
      r'\b(?:upi ?ref(?:erence)?|imps ?ref|ref(?:erence)?|rrn|utr|txn ?id|transaction id|upi)(?: ?(?:no\.?|number|id))? ?(?:[.:#-] ?)?(?:is )?([0-9]{12}|[a-z]{4}[a-z0-9]{12,18})\b');
  static final _accountRe = RegExp(
      r'\b(?:a/c|acct|account|ac)(?: ?(?:no\.?|number))? ?(?:[.:#-] ?)?[x*]+ ?([0-9]{3,6})');
  static final _cardRe = RegExp(
      r'\bcard(?: ?(?:no\.?|number|ending(?: (?:in|with))?))? ?(?:[.:#-] ?)?[x*]* ?([0-9]{4})\b');
  static final _maskRe = RegExp(r'\b[x*]{2,}([0-9]{3,6})\b');
  static final _vpaRe = RegExp(r'[a-z0-9._-]+@[a-z]');

  /// Parses [raw] into a [ParsedNotification], or null if it isn't a
  /// recognizable completed financial transaction.
  ParsedNotification? parse(String raw, {DateTime? now, String? sender}) {
    if (raw.length > maxLength) return null;
    final at = now ?? DateTime.now();
    final lower = raw.toLowerCase().replaceAll(_whitespaceRe, ' ').trim();

    if (_otpRe.hasMatch(lower) || _failedRe.hasMatch(lower)) return null;

    final words = lower.replaceAll(_cardPhraseRe, 'card');
    final hasDebit = _debitWords.any(words.contains);
    final hasCredit = _creditWords.any(words.contains);
    final isRefund = _refundRe.hasMatch(words);
    if (!hasDebit && !hasCredit && !isRefund) return null;

    final isCardBill = lower.contains('card') &&
        _paymentRe.hasMatch(lower) &&
        (lower.contains('received') || lower.contains('credited'));

    final availableBalance =
        parseAmount(_balanceRe.firstMatch(lower)?.group(1));
    final cleaned =
        lower.replaceAll(_balanceRe, ' ').replaceAll(_limitRe, ' ');
    final amountText = _amountRe.firstMatch(cleaned)?.group(1) ??
        _bareAmountRe.firstMatch(cleaned)?.group(1);
    final amount = parseAmount(amountText);
    if (amount == null || amount == Decimal.zero) return null;

    final utr = _utrRe.firstMatch(lower)?.group(1)?.toUpperCase();
    final last4 = _last4(lower);

    // A promotion quotes an amount and a "credited" too, but never a masked
    // account or a reference number — a real alert almost always carries one.
    if (utr == null && last4 == null && _promoRe.hasMatch(lower)) return null;

    final type = (isRefund || isCardBill)
        ? TxnType.income
        : (hasDebit ? TxnType.expense : TxnType.income);
    final kind = isCardBill
        ? CaptureKind.cardBillPayment
        : isRefund
            ? CaptureKind.refund
            : (type == TxnType.income ? CaptureKind.income : CaptureKind.spend);

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
      utr: utr,
      accountLast4: last4,
      availableBalance: availableBalance,
      instrument: _instrument(lower),
      kind: kind,
    );
  }

  String? _last4(String lower) {
    final digits = _accountRe.firstMatch(lower)?.group(1) ??
        _cardRe.firstMatch(lower)?.group(1) ??
        _maskRe.firstMatch(lower)?.group(1);
    if (digits == null) return null;
    return digits.length > 4 ? digits.substring(digits.length - 4) : digits;
  }

  CaptureInstrument _instrument(String lower) {
    if (lower.contains('credit card')) return CaptureInstrument.creditCard;
    if (lower.contains('debit card')) return CaptureInstrument.debitCard;
    if (lower.contains('upi') || lower.contains('vpa') || _vpaRe.hasMatch(lower)) {
      return CaptureInstrument.upi;
    }
    if (lower.contains('a/c') ||
        lower.contains('acct') ||
        lower.contains('account')) {
      return CaptureInstrument.account;
    }
    return CaptureInstrument.unknown;
  }

  String? _merchant(String lower) {
    final m = _merchantRe.firstMatch(lower);
    final raw = m?.group(1)?.trim();
    return (raw == null || raw.isEmpty) ? null : raw;
  }

  /// The sender is the stronger signal: "paid to HDFC Ergo from your ICICI
  /// a/c" mentions two banks in the body, but only one bank sent it.
  BankProfile? _matchProfile(String lower, String? sender) {
    final s = sender?.toLowerCase();
    if (s != null) {
      for (final p in profiles) {
        if (p.senderKeywords.any(s.contains)) return p;
      }
    }
    for (final p in profiles) {
      if (p.senderKeywords.any(lower.contains)) return p;
    }
    return null;
  }

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}
