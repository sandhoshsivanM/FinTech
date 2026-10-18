/// Vocabulary shared by the parser, the router and the review inbox. Pure Dart.
///
/// Every enum carries a stable wire [key] for storage, so renaming a Dart
/// identifier can never reinterpret rows already on disk.
library;

/// The payment rail or product a message is about. Used to match a capture to
/// the right Khazana account (a credit card ••5678 is not the savings a/c ••5678).
enum CaptureInstrument {
  account('account'),
  creditCard('credit_card'),
  debitCard('debit_card'),
  upi('upi'),
  unknown('unknown');

  const CaptureInstrument(this.key);
  final String key;

  static CaptureInstrument fromKey(String? k) => CaptureInstrument.values
      .firstWhere((e) => e.key == k, orElse: () => CaptureInstrument.unknown);
}

/// What the money movement means, which income/expense alone cannot say. A
/// refund and a card-bill payment both arrive as "credited", and neither is
/// income.
enum CaptureKind {
  spend('spend'),
  income('income'),
  refund('refund'),
  cardBillPayment('card_bill_payment');

  const CaptureKind(this.key);
  final String key;

  static CaptureKind fromKey(String? k) => CaptureKind.values
      .firstWhere((e) => e.key == k, orElse: () => CaptureKind.spend);
}

/// Where a capture is in its life. Only [autoPosted], [approved] and
/// [editedApproved] have a transaction behind them; [reversed] had one and the
/// user undid it.
enum CaptureStatus {
  pending('pending'),
  autoPosted('auto_posted'),
  approved('approved'),
  editedApproved('edited_approved'),
  rejected('rejected'),
  reversed('reversed');

  const CaptureStatus(this.key);
  final String key;

  bool get isDecided => this != pending;
  bool get hasTransaction =>
      this == autoPosted || this == approved || this == editedApproved;

  static CaptureStatus fromKey(String? k) => CaptureStatus.values
      .firstWhere((e) => e.key == k, orElse: () => CaptureStatus.pending);
}

/// Why a capture went to the review inbox instead of the ledger. Shown to the
/// user, so each one has a plain-language [label].
enum ReviewReason {
  alwaysReview('always_review', 'You chose to review every capture'),
  unknownAccount('unknown_account', "Which account is this? Link it once and it's remembered"),
  genericParser('generic_parser', 'Sender not recognised as a bank'),
  noMerchant('no_merchant', 'No merchant in the message'),
  noCategory('no_category', 'No category learned for this merchant yet'),
  balanceMismatch('balance_mismatch', "The bank's balance doesn't match Khazana's"),
  unusualAmount('unusual_amount', 'Much larger than usual for this account'),
  refund('refund', 'Refund — check it matches an earlier purchase'),
  cardBillPayment('card_bill_payment', 'Card bill payment — a transfer, not income'),
  possibleTransfer('possible_transfer', 'Looks like a transfer between your own accounts'),
  possibleDuplicate('possible_duplicate', 'Looks like a transaction already recorded'),
  lowConfidence('low_confidence', 'Not confident enough to add automatically'),
  undone('undone', 'You undid this — approve, edit or reject it');

  const ReviewReason(this.key, this.label);
  final String key;
  final String label;

  static ReviewReason? fromKey(String k) =>
      ReviewReason.values.where((e) => e.key == k).firstOrNull;

  static String encode(Iterable<ReviewReason> reasons) =>
      reasons.map((r) => r.key).join(',');

  static List<ReviewReason> decode(String? codes) => (codes == null || codes.isEmpty)
      ? const []
      : codes.split(',').map(fromKey).whereType<ReviewReason>().toList();
}
