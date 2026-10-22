import '../entities/goal.dart';

/// Goal repository contract (PRD §3C). Pure domain — no Drift imports.
abstract interface class IGoalRepository {
  Stream<List<Goal>> watch(String vaultId);
  Future<void> saveGoal(Goal goal);
  Future<void> deleteGoal(String id);
  Future<List<GoalContribution>> contributions(String goalId);

  /// Records a contribution and advances the goal's current amount.
  Future<void> contribute(String goalId, GoalContribution contribution);
}
