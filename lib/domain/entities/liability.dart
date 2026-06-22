import 'package:decimal/decimal.dart';

enum LiabilityKind {
  creditCard('credit_card'),
  loan('loan');

  const LiabilityKind(this.key);
  final String key;
  static LiabilityKind fromKey(String k) =>
      LiabilityKind.values.firstWhere((e) => e.key == k,
          orElse: () => LiabilityKind.loan);
}

/// A debt: credit card balance or loan/EMI (PRD §14 liabilities ledger).
class Liability {
  const Liability({
    required this.id,
    required this.vaultId,
    required this.name,
    required this.kind,
    required this.principal,
    required this.aprPct,
    this.termMonths,
  });

  final String id;
  final String vaultId;
  final String name;
  final LiabilityKind kind;
  final Decimal principal; // outstanding balance
  final Decimal aprPct; // annual interest rate %
  final int? termMonths; // loan term (for EMI)
}
