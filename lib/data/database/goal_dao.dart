import 'package:drift/drift.dart';

import '../models/tables.dart';
import 'app_database.dart';

part 'goal_dao.g.dart';

@DriftAccessor(tables: [Goals, GoalContributions])
class GoalDao extends DatabaseAccessor<AppDatabase> with _$GoalDaoMixin {
  GoalDao(super.db);

  Stream<List<GoalRow>> watchForVault(String vaultId) =>
      (select(goals)..where((g) => g.vaultId.equals(vaultId))).watch();

  Future<void> upsertGoal(GoalsCompanion row) =>
      into(goals).insertOnConflictUpdate(row);

  Future<void> deleteGoal(String id) =>
      (delete(goals)..where((g) => g.id.equals(id))).go();

  Future<GoalRow?> findGoal(String id) =>
      (select(goals)..where((g) => g.id.equals(id))).getSingleOrNull();

  Future<List<GoalContributionRow>> contributionsFor(String goalId) =>
      (select(goalContributions)..where((c) => c.goalId.equals(goalId))).get();

  Future<void> addContribution(GoalContributionsCompanion row) =>
      into(goalContributions).insert(row);
}
