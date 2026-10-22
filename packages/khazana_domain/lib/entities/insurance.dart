import 'package:decimal/decimal.dart';

/// Insurance policy type (PRD parity with web app).
enum InsuranceType {
  life('life'),
  health('health'),
  term('term'),
  vehicle('vehicle'),
  home('home'),
  other('other');

  const InsuranceType(this.key);
  final String key;

  static InsuranceType fromKey(String k) => InsuranceType.values
      .firstWhere((e) => e.key == k, orElse: () => InsuranceType.other);
}

/// An insurance policy. Pure Dart — Decimal money.
class Insurance {
  const Insurance({
    required this.id,
    required this.vaultId,
    required this.name,
    required this.type,
    required this.coverAmount,
    required this.premium,
    this.provider,
    this.renewalDate,
  });

  final String id;
  final String vaultId;
  final String name;
  final InsuranceType type;
  final Decimal coverAmount; // sum assured
  final Decimal premium; // annual premium
  final String? provider;
  final DateTime? renewalDate;
}
