import 'package:decimal/decimal.dart';

import 'transaction.dart';

enum Frequency {
  daily('daily'),
  weekly('weekly'),
  monthly('monthly'),
  yearly('yearly');

  const Frequency(this.key);
  final String key;
  static Frequency fromKey(String k) =>
      Frequency.values.firstWhere((f) => f.key == k, orElse: () => Frequency.monthly);
}

/// A rule that auto-creates a transaction on a schedule (PRD §14 recurring).
class RecurringRule {
  const RecurringRule({
    required this.id,
    required this.vaultId,
    required this.amount,
    required this.type,
    required this.categoryId,
    this.merchant,
    this.note,
    required this.frequency,
    required this.nextRun,
    this.active = true,
  });

  final String id;
  final String vaultId;
  final Decimal amount;
  final TxnType type;
  final String categoryId;
  final String? merchant;
  final String? note;
  final Frequency frequency;
  final DateTime nextRun;
  final bool active;

  RecurringRule copyWith({DateTime? nextRun, bool? active}) => RecurringRule(
        id: id,
        vaultId: vaultId,
        amount: amount,
        type: type,
        categoryId: categoryId,
        merchant: merchant,
        note: note,
        frequency: frequency,
        nextRun: nextRun ?? this.nextRun,
        active: active ?? this.active,
      );
}
