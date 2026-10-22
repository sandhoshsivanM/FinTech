import 'package:decimal/decimal.dart';

/// Goal types supported (PRD §8A).
enum GoalType {
  emergencyFund('emergency_fund', 'Emergency Fund'),
  house('house', 'House Down Payment'),
  vehicle('vehicle', 'Vehicle Fund'),
  vacation('vacation', 'Vacation Fund'),
  education('education', 'Education Fund'),
  custom('custom', 'Custom');

  const GoalType(this.key, this.label);
  final String key;
  final String label;

  static GoalType fromKey(String k) =>
      GoalType.values.firstWhere((g) => g.key == k, orElse: () => GoalType.custom);
}

/// A savings goal (PRD §8B). Pure Dart — Decimal money.
class Goal {
  const Goal({
    required this.id,
    required this.vaultId,
    required this.name,
    required this.goalType,
    required this.targetAmount,
    required this.currentAmount,
    this.targetDate,
    this.notes,
    this.isAchieved = false,
  });

  final String id;
  final String vaultId;
  final String name;
  final GoalType goalType;
  final Decimal targetAmount;
  final Decimal currentAmount;
  final DateTime? targetDate;
  final String? notes;
  final bool isAchieved;
}

/// A manual contribution to a goal (PRD §8B goal_contributions; §8C manual).
class GoalContribution {
  const GoalContribution({
    required this.id,
    required this.goalId,
    required this.amount,
    this.note,
    required this.contributedAt,
  });

  final String id;
  final String goalId;
  final Decimal amount;
  final String? note;
  final DateTime contributedAt;
}
