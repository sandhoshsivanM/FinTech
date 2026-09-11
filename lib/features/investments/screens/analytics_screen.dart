import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../design_system/components/khazana_cards.dart';
import '../../../domain/entities/net_worth_snapshot.dart';
import '../../../domain/services/portfolio_analytics.dart';
import '../../../presentation/charts/area_chart.dart';
import '../../../presentation/charts/bar_chart.dart';
import '../../../presentation/charts/gauge_chart.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/empty_state.dart';
import '../../reports/providers/dashboard_providers.dart';
import '../providers/portfolio_providers.dart';

/// Analytics — risk, diversification and return quality.
///
/// The web twin is `webapp/src/app/analytics/page.tsx`; the three scores use the
/// same formulas so a portfolio does not score 71 on one client and 64 on the
/// other.
///
/// Every score is **null** until there is enough to judge it. One holding cannot
/// be called diversified or concentrated, and a portfolio with nothing invested
/// has no return quality — those read "Not yet tracked" rather than zero, which
/// would look like a failing grade for a portfolio that simply has not been
/// measured.
class AnalyticsScreen extends ConsumerWidget {
  const AnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: const SafeArea(child: DataGate(child: _Body())),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final snap = ref.watch(portfolioSnapshotProvider).valueOrNull;
    final totals = ref.watch(investmentTotalsProvider).valueOrNull;
    final history =
        ref.watch(netWorthSnapshotListProvider).valueOrNull ?? const [];

    if (snap == null || totals == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (snap.positions.isEmpty) {
      return EmptyState(
        icon: Icons.insights_outlined,
        title: 'Nothing to analyse yet',
        message: 'Add a few holdings and this screen will score '
            'diversification, concentration and return quality across the '
            'whole book.',
        action: FilledButton(
          onPressed: () => context.go(Routes.investments),
          child: const Text('Go to Investments'),
        ),
      );
    }

    final positions = snap.positions;
    final groups = totals.valueByGroup.length;
    final conc = totals.concentration;
    final marketValue = totals.marketValue.toDouble();

    // Blended out of two things a reader can check for themselves: how many
    // asset groups are present (capped at five — a seventh group adds far less
    // than a second) and how much the largest one dominates.
    final int? diversification = positions.length < 2
        ? null
        : (((groups.clamp(0, 5)) / 5) * 55 + (1 - (conc ?? 1)) * 45)
            .clamp(0, 100)
            .round();
    final int? risk = positions.length < 2
        ? null
        : (100 - (conc ?? 1) * 70 - (groups <= 2 ? 18 : 0)).clamp(0, 100).round();
    final pnlPct = totals.costBasis <= Decimal.zero
        ? null
        : (totals.unrealisedPnl / totals.costBasis).toDouble() * 100;
    final int? performance =
        pnlPct == null ? null : (50 + pnlPct * 1.6).clamp(0, 100).round();

    final winners =
        positions.where((p) => p.unrealisedPnl > Decimal.zero).length;
    final losers = positions.where((p) => p.unrealisedPnl < Decimal.zero).length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 96),
      children: [
        Text(
          '${positions.length} position${positions.length == 1 ? '' : 's'} '
          'across $groups asset group${groups == 1 ? '' : 's'}',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: AppSpacing.lg),

        _ScoreCard(
          label: 'Diversification',
          icon: Icons.layers_outlined,
          score: diversification,
          sub: '$groups group${groups == 1 ? '' : 's'} · largest '
              '${conc == null ? '—' : '${(conc * 100).toStringAsFixed(1)}%'}',
        ),
        const SizedBox(height: AppSpacing.md),
        _ScoreCard(
          label: 'Concentration risk',
          icon: Icons.shield_outlined,
          score: risk,
          sub: conc == null
              ? 'Needs at least two holdings'
              : 'Largest group is ${(conc * 100).toStringAsFixed(1)}% of the book',
        ),
        const SizedBox(height: AppSpacing.md),
        _ScoreCard(
          label: 'Return quality',
          icon: Icons.emoji_events_outlined,
          score: performance,
          sub: '$winners up · $losers down',
        ),
        const SizedBox(height: AppSpacing.lg),

        _NetWorthMovement(history: history),
        const SizedBox(height: AppSpacing.lg),

        _ReturnDistribution(positions: positions),
        const SizedBox(height: AppSpacing.lg),

        if (history.length > 1) ...[
          KSectionCard(
            title: 'Net worth trend',
            subtitle: '${history.length} recorded snapshots',
            child: SizedBox(
              height: 180,
              child: AreaChart(
                values: [for (final s in history) s.netWorth.toDouble()],
                formatValue: (v) =>
                    Money.compact(v),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
        ],

        _Concentration(
          positions: positions,
          marketValue: marketValue,
          groupShare: conc,
          sectorShare: _largestSectorShare(positions, marketValue),
        ),
      ],
    );
  }

  /// Share of the book in the largest NAMED sector.
  ///
  /// Unclassified is excluded rather than counted: "we do not know" is not a
  /// sector, and letting it win would report a concentration that does not
  /// exist.
  static double _largestSectorShare(List<Position> positions, double total) {
    if (total <= 0) return 0;
    final rows = portfolioAnalytics
        .rollup(positions, RollupDimension.sector)
        .where((r) => r.key != unclassifiedKey)
        .toList();
    if (rows.isEmpty) return 0;
    final largest = rows
        .map((r) => r.marketValue.toDouble())
        .reduce((a, b) => a > b ? a : b);
    return (largest / total) * 100;
  }
}

/// One gauge with its heading underneath — the phone stacks where the web puts
/// three across.
class _ScoreCard extends StatelessWidget {
  const _ScoreCard({
    required this.label,
    required this.icon,
    required this.score,
    required this.sub,
  });

  final String label;
  final IconData icon;
  final int? score;
  final String sub;

  static String? _band(int? s) {
    if (s == null) return null;
    if (s >= 80) return 'Excellent';
    if (s >= 60) return 'Strong';
    if (s >= 40) return 'Fair';
    return 'Needs work';
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return KCard(
      child: Column(
        children: [
          GaugeChart(
            value: score?.toDouble(),
            size: 156,
            sublabel: _band(score),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 15, color: cs.onSurfaceVariant),
              const SizedBox(width: AppSpacing.sm),
              Text(label,
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          Text(sub,
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: cs.onSurfaceVariant)),
        ],
      ),
    );
  }
}

/// Month-on-month change in recorded net worth. Real snapshots only — there is
/// no interpolation here, so a month with no recorded day simply has no bar.
class _NetWorthMovement extends StatelessWidget {
  const _NetWorthMovement({required this.history});

  final List<NetWorthSnapshot> history;

  @override
  Widget build(BuildContext context) {
    final byMonth = <String, double>{};
    final order = <String>[];
    for (final s in history) {
      final key = '${s.date.year}-${s.date.month}';
      if (!byMonth.containsKey(key)) order.add(key);
      byMonth[key] = s.netWorth.toDouble(); // last reading in the month wins
    }

    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final groups = <BarGroup>[];
    for (var i = 1; i < order.length; i++) {
      final delta = byMonth[order[i]]! - byMonth[order[i - 1]]!;
      final m = int.parse(order[i].split('-')[1]);
      groups.add(BarGroup(
        label: months[m - 1],
        bars: [
          Bar(
            value: delta.abs(),
            color: delta >= 0 ? context.colors.income : context.colors.expense,
            label: delta >= 0 ? 'Up' : 'Down',
          ),
        ],
      ));
    }
    final last12 =
        groups.length > 12 ? groups.sublist(groups.length - 12) : groups;

    return KSectionCard(
      title: 'Net worth movement',
      subtitle: 'Month on month, from recorded snapshots',
      child: last12.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
              child: Text(
                'Not enough history yet — a snapshot is recorded each day you '
                'open Khazana.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
            )
          : SizedBox(
              height: 180,
              child: BarChart(
                groups: last12,
                formatValue: (v) =>
                    Money.format(Decimal.parse(v.toStringAsFixed(2))),
              ),
            ),
    );
  }
}

/// How the book's returns are spread, and the three headline numbers under it.
class _ReturnDistribution extends StatelessWidget {
  const _ReturnDistribution({required this.positions});

  final List<Position> positions;

  double _pct(Position p) => p.costBasis == Decimal.zero
      ? 0
      : (p.unrealisedPnl / p.costBasis).toDouble() * 100;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final n = positions.length;
    final pcts = positions.map(_pct).toList();
    final losers = pcts.where((v) => v < 0).length;

    final bands = <(String, int, Color)>[
      ('Above +20%', pcts.where((v) => v > 20).length, context.colors.income),
      ('+5% to +20%', pcts.where((v) => v > 5 && v <= 20).length,
          const Color(0xFFBE8420)),
      ('0% to +5%', pcts.where((v) => v >= 0 && v <= 5).length,
          const Color(0xFF2E92C4)),
      ('Below 0%', losers, context.colors.expense),
    ];

    String signed(double? v) => v == null
        ? '—'
        : '${v >= 0 ? '+' : '−'}${v.abs().toStringAsFixed(1)}%';

    return KSectionCard(
      title: 'Return distribution',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (label, count, color) in bands) ...[
            _Meter(
              label: label,
              trailing: '$count holding${count == 1 ? '' : 's'}',
              fraction: n == 0 ? 0 : count / n,
              color: color,
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          Divider(color: cs.outlineVariant, height: AppSpacing.lg),
          for (final (label, value) in <(String, double?)>[
            ('Best', pcts.isEmpty ? null : pcts.reduce((a, b) => a > b ? a : b)),
            ('Worst', pcts.isEmpty ? null : pcts.reduce((a, b) => a < b ? a : b)),
            ('Win rate',
                n == 0 ? null : (pcts.where((v) => v > 0).length / n) * 100),
          ])
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Text(label, style: Theme.of(context).textTheme.bodyMedium),
                  const Spacer(),
                  Text(signed(value),
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(fontWeight: FontWeight.w700)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Weight of the largest positions, with the thresholds that make them matter.
class _Concentration extends StatelessWidget {
  const _Concentration({
    required this.positions,
    required this.marketValue,
    required this.groupShare,
    required this.sectorShare,
  });

  final List<Position> positions;
  final double marketValue;
  final double? groupShare;
  final double sectorShare;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final values = positions.map((p) => p.marketValue.toDouble()).toList()
      ..sort((a, b) => b.compareTo(a));
    final largest = values.isEmpty || marketValue <= 0
        ? 0.0
        : (values.first / marketValue) * 100;
    final top5 = values.isEmpty || marketValue <= 0
        ? 0.0
        : (values.take(5).fold(0.0, (s, v) => s + v) / marketValue) * 100;

    final rows = <(String, double)>[
      ('Largest holding', largest),
      ('Top 5 holdings', top5),
      ('Largest asset group', (groupShare ?? 0) * 100),
      ('Largest sector', sectorShare),
    ];

    return KSectionCard(
      title: 'Concentration',
      subtitle: 'Weight of the largest positions',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (label, v) in rows) ...[
            _Meter(
              label: label,
              trailing: '${v.toStringAsFixed(1)}%',
              fraction: v / 100,
              // Above half the book in one thing is the point at which this
              // stops being an observation and starts being a risk.
              color: v > 50 ? context.colors.budgetWarn : cs.primary,
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          Text(
            'A single holding above 10% of the book, or one sector above 35%, '
            'is where concentration usually starts to matter.',
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: cs.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

/// A labelled bar. The figure sits beside the label, never inside the bar —
/// a number on a coloured fill loses contrast exactly when the bar is short.
class _Meter extends StatelessWidget {
  const _Meter({
    required this.label,
    required this.trailing,
    required this.fraction,
    required this.color,
  });

  final String label;
  final String trailing;
  final double fraction;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall),
            ),
            Text(trailing,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(fontWeight: FontWeight.w700)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(AppRadii.pill),
          child: LinearProgressIndicator(
            value: fraction.isFinite ? fraction.clamp(0.0, 1.0) : 0,
            minHeight: 6,
            backgroundColor: cs.surfaceContainerHighest,
            valueColor: AlwaysStoppedAnimation<Color>(color),
          ),
        ),
      ],
    );
  }
}
