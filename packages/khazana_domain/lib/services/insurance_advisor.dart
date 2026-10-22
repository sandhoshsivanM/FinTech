import 'package:decimal/decimal.dart';

import '../entities/insurance.dart';

/// Coverage-gap analysis. Rules of thumb are explicit constants, not advice.
class CoverageGap {
  const CoverageGap({
    required this.kind,
    required this.label,
    required this.current,
    required this.recommended,
    required this.gap,
    required this.coveredPct,
  });
  final String kind; // 'life' | 'health'
  final String label;
  final Decimal current;
  final Decimal recommended;
  final Decimal gap; // recommended − current (0 if covered)
  final int coveredPct;
}

class InsuranceAdvisor {
  const InsuranceAdvisor();

  static const int lifeCoverMultiple = 10; // ≈ 10× annual income
  static final Decimal healthCoverFloor = Decimal.fromInt(500000); // ₹5L

  Decimal annualPremiumTotal(List<Insurance> policies) =>
      policies.fold(Decimal.zero, (s, p) => s + p.premium);

  List<CoverageGap> coverageGaps(
      List<Insurance> policies, Decimal annualIncome) {
    final life = policies
        .where((p) => p.type == InsuranceType.life || p.type == InsuranceType.term)
        .fold(Decimal.zero, (s, p) => s + p.coverAmount);
    final health = policies
        .where((p) => p.type == InsuranceType.health)
        .fold(Decimal.zero, (s, p) => s + p.coverAmount);

    final lifeRec = annualIncome * Decimal.fromInt(lifeCoverMultiple);
    final halfIncome = annualIncome * Decimal.parse('0.5');
    final healthRec = halfIncome > healthCoverFloor ? halfIncome : healthCoverFloor;

    CoverageGap mk(String kind, String label, Decimal cur, Decimal rec) {
      final gap = (rec - cur) > Decimal.zero ? rec - cur : Decimal.zero;
      final pct = rec <= Decimal.zero
          ? 100
          : (cur.toDouble() / rec.toDouble() * 100).round();
      return CoverageGap(
          kind: kind, label: label, current: cur, recommended: rec, gap: gap, coveredPct: pct);
    }

    return [
      mk('life', 'Life cover', life, lifeRec),
      mk('health', 'Health cover', health, healthRec),
    ];
  }
}
