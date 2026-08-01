import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/data_providers.dart';
import '../../../domain/entities/net_worth_snapshot.dart';
import '../../../domain/services/financial_health.dart';
import '../../../domain/services/insights_engine.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/services/narrative_engine.dart';
import '../../../domain/services/net_worth_calculator.dart';
import '../../../domain/entities/investment_totals.dart';
import '../../budget/providers/budget_providers.dart';
import '../../goals/providers/goal_providers.dart';
import '../../insurance/providers/insurance_providers.dart';
import '../../investments/providers/portfolio_providers.dart';
import '../../liabilities/providers/liability_providers.dart';
import '../../transactions/providers/category_providers.dart';
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
///
/// Null while any input is still loading. Defaulting the portfolio to
/// [InvestmentTotals.empty] instead would tell the score there are no
/// investments, so the grade would visibly dip on every cold open and settle a
/// moment later — a fabricated number, which is the thing this score is meant
/// not to produce.
final financialHealthProvider = Provider<HealthScore?>((ref) {
  final txnState = ref.watch(transactionListProvider);
  if (txnState is! TransactionData) return null;
  final investments = ref.watch(investmentTotalsProvider).valueOrNull;
  if (investments == null) return null;
  final liabs = ref.watch(liabilityListProvider).valueOrNull ?? const [];
  return const FinancialHealth().compute(HealthInputs(
    txns: txnState.transactions,
    investments: investments,
    liabilities: liabs,
    // These four decide whether Protection, Efficiency and Future are tracked
    // at all, so an empty default is not neutral: it renders those categories
    // as "Not yet tracked" until they load. They come from streams that resolve
    // in the same frame as the two gated above.
    goals: ref.watch(goalListProvider).valueOrNull ?? const [],
    insurances: ref.watch(insuranceListProvider).valueOrNull ?? const [],
    budgets: ref.watch(budgetListProvider).valueOrNull ?? const [],
    snapshots: ref.watch(netWorthSnapshotListProvider).valueOrNull ?? const [],
  ));
});

/// The raw daily snapshot rows.
final netWorthSnapshotListProvider =
    StreamProvider<List<NetWorthSnapshot>>((ref) {
  return ref
      .watch(netWorthSnapshotRepositoryProvider)
      .watch(ref.watch(currentVaultIdProvider));
});

/// Real net-worth history from daily snapshots (mapped to trend points).
final netWorthHistoryProvider = Provider<AsyncValue<List<NetWorthPoint>>>((ref) {
  return ref.watch(netWorthSnapshotListProvider).whenData(
      (list) => list.map((s) => NetWorthPoint(s.date, s.netWorth)).toList());
});

/// The most recent stored snapshot, for the cold-open path.
///
/// The Dashboard's live figures need the whole transaction ledger and the whole
/// portfolio to resolve before they exist. That is a spinner on every cold
/// open, on the one screen the plan says must answer "how am I doing" in under
/// three seconds.
///
/// This is yesterday's number, rendered immediately and replaced the moment the
/// real one arrives. It is explicitly *not* treated as current: the hero card
/// marks it as an "as of" figure, because showing a stale number as though it
/// were live is the failure mode this whole change has been removing.
final cachedNetWorthProvider = Provider<NetWorthSnapshot?>((ref) {
  final snaps = ref.watch(netWorthSnapshotListProvider).valueOrNull;
  if (snaps == null || snaps.isEmpty) return null;
  return snaps.reduce((a, b) => b.date.isAfter(a.date) ? b : a);
});

/// Trend series: prefer real snapshots once we have ≥2, else the derived series.
final dashboardTrendProvider = Provider<List<NetWorthPoint>>((ref) {
  final snaps = ref.watch(netWorthHistoryProvider).valueOrNull ?? const [];
  if (snaps.length >= 2) return snaps;
  return ref.watch(netWorthProvider)?.series ?? const [];
});

/// Captures (or updates) today's net-worth snapshot once data is loaded.
///
/// Gated on every input having *resolved*, not merely having a default. A
/// snapshot row is persistent and one row per day, so a write that lands while
/// the portfolio stream is still loading records a permanently wrong point in
/// the trend line — and the trend is exactly what the user would consult to
/// find out whether that dip was real.
final snapshotCaptureProvider = FutureProvider<void>((ref) async {
  final txnState = ref.watch(transactionListProvider);
  if (txnState is! TransactionData) return;
  final investments = ref.watch(investmentTotalsProvider).valueOrNull;
  if (investments == null) return;
  final liabsAsync = ref.watch(liabilityListProvider);
  if (!liabsAsync.hasValue) return;
  final liabs = liabsAsync.requireValue;
  const calc = NetWorthCalculator();
  final cash = calc.total(txnState.transactions);
  final invest = investments.marketValue;
  final liab = liabs.fold(Decimal.zero, (s, l) => s + l.principal);
  final vault = ref.watch(currentVaultIdProvider);
  final now = DateTime.now();
  final day = '${now.year}-${now.month.toString().padLeft(2, '0')}-'
      '${now.day.toString().padLeft(2, '0')}';
  // Both stay null when the score cannot be computed. A day with nothing
  // tracked has no score, and writing 0 would put a failing grade into the
  // history chart for a day the app simply had no opinion about.
  final health = ref.watch(financialHealthProvider);
  await ref.read(netWorthSnapshotRepositoryProvider).save(NetWorthSnapshot(
        id: 'snap-$vault-$day',
        vaultId: vault,
        date: now,
        netWorth: cash + invest - liab,
        cash: cash,
        investments: invest,
        liabilities: liab,
        healthScore: health?.score,
        healthTrackedWeight: health?.trackedWeight.round(),
      ));
});

/// The Score screen's trend line: past health scores, oldest first.
///
/// Days with no score are skipped rather than plotted at zero — the chart shows
/// the scores that existed, not a dip on every day the app could not judge.
final scoreHistoryProvider = Provider<List<double>>((ref) {
  final snaps = ref.watch(netWorthSnapshotListProvider).valueOrNull ?? const [];
  final sorted = [...snaps]..sort((a, b) => a.date.compareTo(b.date));
  return [
    for (final s in sorted)
      if (s.healthScore != null) s.healthScore!.toDouble(),
  ];
});

/// The narrative sentences for the Dashboard card and the Score screen.
///
/// Reuses the already-computed health score, insights and portfolio totals
/// rather than recomputing them — otherwise the Dashboard pays for the health
/// score twice on every rebuild.
final narrativeProvider = Provider<List<Narrative>>((ref) {
  final health = ref.watch(financialHealthProvider);
  final investments = ref.watch(investmentTotalsProvider).valueOrNull;
  if (health == null || investments == null) return const [];
  final insights = ref.watch(dashboardInsightsProvider);
  final categories = ref.watch(categoryListProvider).valueOrNull ?? const [];

  return const NarrativeEngine().generate(NarrativeContext(
    health: health,
    investments: investments,
    safeToSpend: insights?.safe,
    anomalies: insights?.anomalies ?? const [],
    snapshots: ref.watch(netWorthSnapshotListProvider).valueOrNull ?? const [],
    categoryNames: {for (final c in categories) c.id: c.name},
    currencyFormat: Money.format,
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
