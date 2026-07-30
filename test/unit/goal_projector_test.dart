import 'package:decimal/decimal.dart';
import 'package:khazana/domain/entities/goal.dart';
import 'package:khazana/domain/services/goal_projector.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const projector = GoalProjector();
  final now = DateTime(2026, 6, 1);

  Goal goal(String target, String current, {DateTime? targetDate}) => Goal(
        id: 'g',
        vaultId: 'v',
        name: 'Emergency Fund',
        goalType: GoalType.emergencyFund,
        targetAmount: Decimal.parse(target),
        currentAmount: Decimal.parse(current),
        targetDate: targetDate,
      );

  GoalContribution contrib(String amount, DateTime at) => GoalContribution(
        id: at.toIso8601String(),
        goalId: 'g',
        amount: Decimal.parse(amount),
        contributedAt: at,
      );

  test('fraction reflects current/target', () {
    final p = projector.evaluate(goal('100000', '25000'), const [], now: now);
    expect(p.fraction, closeTo(0.25, 0.001));
  });

  test('achieved when current >= target', () {
    final p = projector.evaluate(goal('100000', '100000'), const [], now: now);
    expect(p.isAchieved, isTrue);
  });

  test('projects completion from average contribution rate', () {
    // 50k saved over ~5 months → 10k/month; 50k remaining → ~5 months out.
    final p = projector.evaluate(
      goal('100000', '50000'),
      [
        contrib('10000', DateTime(2026, 1, 1)),
        contrib('10000', DateTime(2026, 2, 1)),
        contrib('10000', DateTime(2026, 3, 1)),
        contrib('10000', DateTime(2026, 4, 1)),
        contrib('10000', DateTime(2026, 5, 1)),
      ],
      now: now,
    );
    expect(p.projectedCompletion, isNotNull);
  });

  test('flags behind pace when projection overshoots the target date', () {
    // Slow pace, near-term deadline → behind.
    final p = projector.evaluate(
      goal('100000', '10000', targetDate: DateTime(2026, 8, 1)),
      [contrib('5000', DateTime(2026, 1, 1)), contrib('5000', DateTime(2026, 5, 1))],
      now: now,
    );
    expect(p.onTrack, isFalse);
    expect(p.monthsBehind, greaterThan(0));
  });
}
