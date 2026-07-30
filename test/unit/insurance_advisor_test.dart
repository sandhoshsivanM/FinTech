import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/domain/entities/insurance.dart';
import 'package:khazana/domain/services/insurance_advisor.dart';

Decimal d(int v) => Decimal.fromInt(v);

Insurance _policy(InsuranceType type, int cover, int premium) => Insurance(
      id: 'i-$type-$cover',
      vaultId: 'v',
      name: 'P',
      type: type,
      coverAmount: d(cover),
      premium: d(premium),
    );

void main() {
  const advisor = InsuranceAdvisor();

  test('life cover gap = 10× income − current', () {
    final gaps = advisor.coverageGaps(
      [_policy(InsuranceType.life, 4000000, 12000)],
      d(1000000), // ₹10L annual income → ₹1Cr recommended
    );
    final life = gaps.firstWhere((g) => g.kind == 'life');
    expect(life.recommended, d(10000000));
    expect(life.gap, d(6000000));
    expect(life.coveredPct, 40);
  });

  test('health uses the ₹5L floor when income is low', () {
    final gaps = advisor.coverageGaps(const [], d(200000));
    final health = gaps.firstWhere((g) => g.kind == 'health');
    expect(health.recommended, d(500000)); // max(half income, 5L)
    expect(health.coveredPct, 0);
  });

  test('annual premium total sums all policies', () {
    final total = advisor.annualPremiumTotal([
      _policy(InsuranceType.life, 5000000, 15000),
      _policy(InsuranceType.health, 1000000, 22000),
    ]);
    expect(total, d(37000));
  });
}
