import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../domain/entities/liability.dart';
import '../../../domain/services/debt_calculator.dart';

const _uuid = Uuid();

final debtCalculatorProvider =
    Provider<DebtCalculator>((ref) => const DebtCalculator());

final liabilityListProvider = StreamProvider<List<Liability>>((ref) {
  return ref
      .watch(liabilityRepositoryProvider)
      .watch(ref.watch(currentVaultIdProvider));
});

final liabilityActionsProvider =
    Provider<LiabilityActions>((ref) => LiabilityActions(ref));

class LiabilityActions {
  LiabilityActions(this._ref);
  final Ref _ref;

  Future<void> add({
    required String name,
    required LiabilityKind kind,
    required Decimal principal,
    required Decimal aprPct,
    int? termMonths,
  }) {
    return _ref.read(liabilityRepositoryProvider).save(Liability(
          id: _uuid.v4(),
          vaultId: _ref.read(currentVaultIdProvider),
          name: name,
          kind: kind,
          principal: principal,
          aprPct: aprPct,
          termMonths: termMonths,
        ));
  }

  Future<void> delete(String id) =>
      _ref.read(liabilityRepositoryProvider).delete(id);

  PayoffResult simulate(
    List<Liability> liabilities,
    Decimal monthlyBudget,
    PayoffStrategy strategy,
  ) =>
      _ref.read(debtCalculatorProvider).simulate(
            liabilities,
            monthlyBudget,
            strategy,
          );
}
