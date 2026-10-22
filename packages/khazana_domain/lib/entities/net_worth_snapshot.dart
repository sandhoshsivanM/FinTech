import 'package:decimal/decimal.dart';

/// A point-in-time net-worth snapshot (real history, captured daily). Pure Dart.
class NetWorthSnapshot {
  const NetWorthSnapshot({
    required this.id,
    required this.vaultId,
    required this.date,
    required this.netWorth,
    required this.cash,
    required this.investments,
    required this.liabilities,
    this.healthScore,
    this.healthTrackedWeight,
  });

  final String id;
  final String vaultId;
  final DateTime date;
  final Decimal netWorth;
  final Decimal cash;
  final Decimal investments;
  final Decimal liabilities;

  /// Health score on this day, 0-100. Null when nothing was tracked — see the
  /// column doc in `tables.dart`; storing 0 would fabricate a failing grade.
  final int? healthScore;

  /// Share of the score's weight that was tracked, 0-100.
  final int? healthTrackedWeight;
}
