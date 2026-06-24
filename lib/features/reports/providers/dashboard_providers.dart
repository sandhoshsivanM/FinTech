import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../domain/services/net_worth_calculator.dart';
import '../../transactions/providers/transaction_providers.dart';

final netWorthCalculatorProvider =
    Provider<NetWorthCalculator>((ref) => const NetWorthCalculator());

/// Selected dashboard window (PRD §14: 7D/1M/3M).
final selectedWindowProvider =
    StateProvider<TimeWindow>((ref) => TimeWindow.oneMonth);

/// Ghost mode — when true, all monetary values on the dashboard are masked
/// as "••••••" (PRD §3B privacy feature).
final ghostModeProvider = StateProvider<bool>((ref) => false);

class DashboardData {
  const DashboardData({
    required this.total,
    required this.summary,
    required this.series,
  });
  final Decimal total;
  final WindowSummary summary;
  final List<NetWorthPoint> series;
}

/// Net worth dashboard data derived from the live transaction list (PRD §3C
/// `netWorthProvider`).
final netWorthProvider = Provider<DashboardData?>((ref) {
  final txnState = ref.watch(transactionListProvider);
  if (txnState is! TransactionData) return null;
  final calc = ref.watch(netWorthCalculatorProvider);
  final window = ref.watch(selectedWindowProvider);
  final all = txnState.transactions;
  return DashboardData(
    total: calc.total(all),
    summary: calc.summary(all, window),
    series: calc.series(all, window),
  );
});
