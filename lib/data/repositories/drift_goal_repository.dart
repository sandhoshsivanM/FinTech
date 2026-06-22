import 'package:drift/drift.dart';

import '../../domain/entities/goal.dart';
import '../../domain/repositories/goal_repository.dart';
import '../database/app_database.dart';
import '../database/goal_dao.dart';

class DriftGoalRepository implements IGoalRepository {
  DriftGoalRepository(this._dao);
  final GoalDao _dao;

  @override
  Stream<List<Goal>> watch(String vaultId) =>
      _dao.watchForVault(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Future<void> saveGoal(Goal g) => _dao.upsertGoal(GoalsCompanion(
        id: Value(g.id),
        vaultId: Value(g.vaultId),
        name: Value(g.name),
        goalType: Value(g.goalType.key),
        targetAmount: Value(g.targetAmount),
        currentAmount: Value(g.currentAmount),
        targetDate: Value(g.targetDate?.millisecondsSinceEpoch),
        notes: Value(g.notes),
        isAchieved: Value(g.currentAmount >= g.targetAmount),
        createdAt: Value(DateTime.now().millisecondsSinceEpoch),
      ));

  @override
  Future<void> deleteGoal(String id) => _dao.deleteGoal(id);

  @override
  Future<List<GoalContribution>> contributions(String goalId) async =>
      (await _dao.contributionsFor(goalId)).map(_toContribution).toList();

  @override
  Future<void> contribute(String goalId, GoalContribution c) async {
    await _dao.addContribution(GoalContributionsCompanion(
      id: Value(c.id),
      goalId: Value(goalId),
      amount: Value(c.amount),
      note: Value(c.note),
      contributedAt: Value(c.contributedAt.millisecondsSinceEpoch),
    ));
    final goal = await _dao.findGoal(goalId);
    if (goal != null) {
      final newCurrent = goal.currentAmount + c.amount;
      await _dao.upsertGoal(GoalsCompanion(
        id: Value(goal.id),
        vaultId: Value(goal.vaultId),
        name: Value(goal.name),
        goalType: Value(goal.goalType),
        targetAmount: Value(goal.targetAmount),
        currentAmount: Value(newCurrent),
        targetDate: Value(goal.targetDate),
        notes: Value(goal.notes),
        isAchieved: Value(newCurrent >= goal.targetAmount),
        createdAt: Value(goal.createdAt),
      ));
    }
  }

  static Goal _toEntity(GoalRow r) => Goal(
        id: r.id,
        vaultId: r.vaultId,
        name: r.name,
        goalType: GoalType.fromKey(r.goalType),
        targetAmount: r.targetAmount,
        currentAmount: r.currentAmount,
        targetDate: r.targetDate == null
            ? null
            : DateTime.fromMillisecondsSinceEpoch(r.targetDate!),
        notes: r.notes,
        isAchieved: r.isAchieved,
      );

  static GoalContribution _toContribution(GoalContributionRow r) =>
      GoalContribution(
        id: r.id,
        goalId: r.goalId,
        amount: r.amount,
        note: r.note,
        contributedAt: DateTime.fromMillisecondsSinceEpoch(r.contributedAt),
      );
}
