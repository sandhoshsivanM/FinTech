import 'package:decimal/decimal.dart';

/// Chart-of-accounts classification for double-entry bookkeeping (PRD §16
/// double-entry ledger). Asset & expense accounts are *debit-normal*: a positive
/// (debit) balance is their natural increase. Liability, income and equity
/// accounts are *credit-normal*: they increase with credits (negative postings).
enum AccountType {
  asset('asset'),
  liability('liability'),
  income('income'),
  expense('expense'),
  equity('equity');

  const AccountType(this.key);
  final String key;

  static AccountType fromKey(String k) => AccountType.values
      .firstWhere((e) => e.key == k, orElse: () => AccountType.asset);

  /// Debit-normal accounts grow with positive (debit) postings.
  bool get isDebitNormal =>
      this == AccountType.asset || this == AccountType.expense;

  /// Whether this account's balance participates in net-worth (stock) totals.
  bool get isNetWorth =>
      this == AccountType.asset || this == AccountType.liability;
}

/// A single account in the chart of accounts. Pure Dart — Decimal money.
///
/// [openingBalance] is a *natural magnitude* (≥ 0); its debit-signed
/// contribution is derived from [type] in the ledger math, so callers never
/// reason about signs. Investment securities are tracked as [Holding]s, not as
/// accounts, to avoid double-counting in net worth.
class Account {
  Account({
    required this.id,
    required this.vaultId,
    required this.name,
    required this.type,
    required this.subtype,
    this.currency = 'INR',
    Decimal? openingBalance,
    this.archived = false,
  }) : openingBalance = openingBalance ?? Decimal.zero;

  final String id;
  final String vaultId;
  final String name;
  final AccountType type;

  /// Finer classification: cash | bank | credit_card | loan | investment |
  /// manual_asset | income | expense | equity. Free-form to stay forward
  /// compatible; the [type] enum drives all ledger math.
  final String subtype;
  final String currency;
  final Decimal openingBalance; // natural magnitude, ≥ 0
  final bool archived;

  /// Opening balance expressed in debit-signed terms (PRD §16): debit-normal
  /// accounts seed positive, credit-normal accounts seed negative.
  Decimal get openingDebitSigned =>
      type.isDebitNormal ? openingBalance : -openingBalance;

  Account copyWith({
    String? name,
    String? subtype,
    Decimal? openingBalance,
    bool? archived,
  }) {
    return Account(
      id: id,
      vaultId: vaultId,
      name: name ?? this.name,
      type: type,
      subtype: subtype ?? this.subtype,
      currency: currency,
      openingBalance: openingBalance ?? this.openingBalance,
      archived: archived ?? this.archived,
    );
  }
}
