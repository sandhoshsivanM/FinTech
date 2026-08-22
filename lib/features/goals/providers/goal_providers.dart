import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../core/services/notification_sync_service.dart';
import '../../../domain/entities/goal.dart';

const _uuid = Uuid();

final goalListProvider = StreamProvider<List<Goal>>((ref) {
  return ref
      .watch(goalRepositoryProvider)
      .watch(ref.watch(currentVaultIdProvider));
});

final goalContributionsProvider =
    FutureProvider.family<List<GoalContribution>, String>((ref, goalId) {
  ref.watch(goalListProvider); // refresh after a contribution
  return ref.watch(goalRepositoryProvider).contributions(goalId);
});

final goalActionsProvider = Provider<GoalActions>((ref) => GoalActions(ref));

class GoalActions {
  GoalActions(this._ref);
  final Ref _ref;

  Future<void> add({
    required String name,
    required GoalType type,
    required Decimal target,
    DateTime? targetDate,
    String? notes,
  }) async {
    await _ref.read(goalRepositoryProvider).saveGoal(Goal(
          id: _uuid.v4(),
          vaultId: _ref.read(currentVaultIdProvider),
          name: name,
          goalType: type,
          targetAmount: target,
          currentAmount: Decimal.zero,
          targetDate: targetDate,
          notes: notes,
        ));
    // A new target date the OS has not been told about yet.
    _ref.reconcileNotifications();
  }

  Future<void> delete(String id) async {
    await _ref.read(goalRepositoryProvider).deleteGoal(id);
    // Alarms outlive the records they describe.
    _ref.reconcileNotifications();
  }

  Future<void> contribute(String goalId, Decimal amount, {String? note}) {
    return _ref.read(goalRepositoryProvider).contribute(
          goalId,
          GoalContribution(
            id: _uuid.v4(),
            goalId: goalId,
            amount: amount,
            note: note,
            contributedAt: DateTime.now(),
          ),
        );
  }
}
