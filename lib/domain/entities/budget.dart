import 'package:decimal/decimal.dart';

/// Monthly category budget (PRD §7B). Pure Dart — no Drift/Flutter imports.
class Budget {
  const Budget({
    required this.id,
    required this.vaultId,
    required this.categoryId,
    required this.amountLimit,
    this.periodType = 'monthly',
    this.rolloverEnabled = false,
    this.alertThresholdPct = 90,
  });

  final String id;
  final String vaultId;
  final String categoryId;
  final Decimal amountLimit;
  final String periodType;
  final bool rolloverEnabled;
  final int alertThresholdPct;
}
