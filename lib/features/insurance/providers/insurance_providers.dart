import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../domain/entities/insurance.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/services/insurance_advisor.dart';
import '../../transactions/providers/transaction_providers.dart';

const _uuid = Uuid();

final insuranceAdvisorProvider =
    Provider<InsuranceAdvisor>((ref) => const InsuranceAdvisor());

final insuranceListProvider = StreamProvider<List<Insurance>>((ref) {
  return ref
      .watch(insuranceRepositoryProvider)
      .watch(ref.watch(currentVaultIdProvider));
});

/// Annual income estimate from the last 365 days of income transactions.
final annualIncomeProvider = Provider<Decimal>((ref) {
  final s = ref.watch(transactionListProvider);
  if (s is! TransactionData) return Decimal.zero;
  final cutoff = DateTime.now().subtract(const Duration(days: 365));
  return s.transactions
      .where((t) => t.type == TxnType.income && t.date.isAfter(cutoff))
      .fold(Decimal.zero, (a, t) => a + t.amount);
});

final coverageGapsProvider = Provider<List<CoverageGap>>((ref) {
  final policies = ref.watch(insuranceListProvider).valueOrNull ?? const [];
  return ref
      .watch(insuranceAdvisorProvider)
      .coverageGaps(policies, ref.watch(annualIncomeProvider));
});

final insuranceActionsProvider =
    Provider<InsuranceActions>((ref) => InsuranceActions(ref));

class InsuranceActions {
  InsuranceActions(this._ref);
  final Ref _ref;

  Future<void> save({
    String? id,
    required String name,
    required InsuranceType type,
    String? provider,
    required Decimal coverAmount,
    required Decimal premium,
    DateTime? renewalDate,
  }) {
    return _ref.read(insuranceRepositoryProvider).save(Insurance(
          id: id ?? _uuid.v4(),
          vaultId: _ref.read(currentVaultIdProvider),
          name: name,
          type: type,
          provider: provider,
          coverAmount: coverAmount,
          premium: premium,
          renewalDate: renewalDate,
        ));
  }

  Future<void> delete(String id) =>
      _ref.read(insuranceRepositoryProvider).delete(id);
}
