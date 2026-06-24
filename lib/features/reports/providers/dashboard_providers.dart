import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/data_providers.dart';
import '../../../domain/entities/net_worth_snapshot.dart';
import '../../../domain/services/financial_health.dart';
import '../../../domain/services/insights_engine.dart';
import '../../../domain/services/net_worth_calculator.dart';
import '../../investments/providers/investment_providers.dart';
import '../../liabilities/providers/liability_providers.dart';
import '../../transactions/providers/recurring_providers.dart';
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

/// Financial-health score (0–100) across cash, investments and liabilities.
final financialHealthProvider = Provider<HealthScore?>((ref) {
  final txnState = ref.watch(transactionListProvider);
  if (txnState is! TransactionData) return null;
  final holdings = ref.watch(holdingListProvider).valueOrNull ?? const [];
  final liabs = ref.watch(liabilityListProvider).valueOrNull ?? const [];
  return const FinancialHealth().compute(txnState.transactions, holdings, liabs);
});

/// Real net-worth history from daily snapshots (mapped to trend points).
final netWorthHistoryProvider = StreamProvider<List<NetWorthPoint>>((ref) {
  return ref
      .watch(netWorthSnapshotRepositoryProvider)
      .watch(ref.watch(currentVaultIdProvider))
      .map((list) =>
          list.map((s) => NetWorthPoint(s.date, s.netWorth)).toList());
});

/// Trend series: prefer real snapshots once we have ≥2, else the derived series.
final dashboardTrendProvider = Provider<List<NetWorthPoint>>((ref) {
  final snaps = ref.watch(netWorthHistoryProvider).valueOrNull ?? const [];
  if (snaps.length >= 2) return snaps;
  return ref.watch(netWorthProvider)?.series ?? const [];
});

/// Captures (or updates) today's net-worth snapshot once data is loaded.
final snapshotCaptureProvider = FutureProvider<void>((ref) async {
  final txnState = ref.watch(transactionListProvider);
  if (txnState is! TransactionData) return;
  final holdings = ref.watch(holdingListProvider).valueOrNull ?? const [];
  final liabs = ref.watch(liabilityListProvider).valueOrNull ?? const [];
  const calc = NetWorthCalculator();
  final cash = calc.total(txnState.transactions);
  final invest = holdings.fold(Decimal.zero, (s, h) => s + h.marketValue);
  final liab = liabs.fold(Decimal.zero, (s, l) => s + l.principal);
  final vault = ref.watch(currentVaultIdProvider);
  final now = DateTime.now();
  final day = '${now.year}-${now.month.toString().padLeft(2, '0')}-'
      '${now.day.toString().padLeft(2, '0')}';
  await ref.read(netWorthSnapshotRepositoryProvider).save(NetWorthSnapshot(
        id: 'snap-$vault-$day',
        vaultId: vault,
        date: now,
        netWorth: cash + invest - liab,
        cash: cash,
        investments: invest,
        liabilities: liab,
      ));
});

/// Combined local insights (safe-to-spend + spending anomalies).
typedef DashboardInsights = ({SafeToSpend safe, List<SpendingAnomaly> anomalies});

final dashboardInsightsProvider = Provider<DashboardInsights?>((ref) {
  final txnState = ref.watch(transactionListProvider);
  if (txnState is! TransactionData) return null;
  final recurring = ref.watch(recurringListProvider).valueOrNull ?? const [];
  const engine = InsightsEngine();
  return (
    safe: engine.safeToSpend(txnState.transactions, recurring),
    anomalies: engine.spendingAnomalies(txnState.transactions),
  );
});
