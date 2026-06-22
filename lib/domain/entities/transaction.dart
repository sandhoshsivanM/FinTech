import 'package:decimal/decimal.dart';

/// Income or expense (PRD §7C, §14 cash flow ledger).
enum TxnType { expense, income }

/// Pure-Dart transaction entity. No Drift / Flutter imports (PRD §3 domain layer).
/// All monetary values use [Decimal] — double is banned (PRD §2).
class Txn {
  const Txn({
    required this.id,
    required this.vaultId,
    required this.amount,
    required this.type,
    required this.categoryId,
    required this.date,
    this.merchant,
    this.note,
    required this.createdAt,
  });

  final String id;
  final String vaultId;
  final Decimal amount; // always positive; sign comes from [type]
  final TxnType type;
  final String categoryId;
  final DateTime date;
  final String? merchant;
  final String? note;
  final DateTime createdAt;

  /// Signed contribution to net worth: income adds, expense subtracts (PRD §16).
  Decimal get signedAmount =>
      type == TxnType.income ? amount : -amount;

  Txn copyWith({
    Decimal? amount,
    TxnType? type,
    String? categoryId,
    DateTime? date,
    String? merchant,
    String? note,
  }) {
    return Txn(
      id: id,
      vaultId: vaultId,
      amount: amount ?? this.amount,
      type: type ?? this.type,
      categoryId: categoryId ?? this.categoryId,
      date: date ?? this.date,
      merchant: merchant ?? this.merchant,
      note: note ?? this.note,
      createdAt: createdAt,
    );
  }
}
