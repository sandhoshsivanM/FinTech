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
  });

  final String id;
  final String vaultId;
  final DateTime date;
  final Decimal netWorth;
  final Decimal cash;
  final Decimal investments;
  final Decimal liabilities;
}
