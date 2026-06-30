import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../domain/entities/transaction.dart';
import '../../../domain/services/safety_net.dart';
import '../../goals/providers/goal_providers.dart';
import '../../insurance/providers/insurance_providers.dart';
import '../../investments/providers/investment_providers.dart';
import '../../transactions/providers/transaction_providers.dart';

final safetyNetServiceProvider =
    Provider<SafetyNetService>((ref) => const SafetyNetService());

/// Aggregates the four live lists into one readiness score. Pure compute on
/// top of the existing repository-backed providers — mirrors the web page.
final safetyNetProvider = Provider<SafetyNet>((ref) {
  final txnState = ref.watch(transactionListProvider);
  final List<Txn> txns =
      txnState is TransactionData ? txnState.transactions : const <Txn>[];
  final goals = ref.watch(goalListProvider).valueOrNull ?? const [];
  final insurances = ref.watch(insuranceListProvider).valueOrNull ?? const [];
  final holdings = ref.watch(holdingListProvider).valueOrNull ?? const [];

  return ref.watch(safetyNetServiceProvider).compute(
        txns,
        goals,
        insurances,
        holdings,
      );
});
