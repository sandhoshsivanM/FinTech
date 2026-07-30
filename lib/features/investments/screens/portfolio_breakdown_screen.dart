import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/asset_group.dart';
import '../../../domain/services/portfolio_analytics.dart';
import '../../../presentation/asset_group_colors.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/donut_chart.dart';
import '../../../presentation/glass_card.dart';
import '../providers/portfolio_providers.dart';

/// Sector-wise (and industry / market-cap / asset-class) profit and loss.
///
/// The screen this feature exists for: the previous portfolio view could show
/// total value but had no cost basis, no price date and no sector, so P&L was
/// not computable at any level.
class PortfolioBreakdownScreen extends ConsumerWidget {
  const PortfolioBreakdownScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Breakdown')),
      body: DataGate(child: _Body()),
    );
  }
}

class _Body extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(portfolioSnapshotProvider);

    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Could not load portfolio: $e')),
      data: (snap) {
        if (snap.positions.isEmpty) {
          return const _Empty();
        }
        return ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            _TotalsCard(snap: snap),
            const SizedBox(height: AppSpacing.md),
            if (snap.unpriced.isNotEmpty) ...[
              _UnpricedNotice(count: snap.unpriced.length),
              const SizedBox(height: AppSpacing.md),
            ],
            const _AllocationCard(),
            const SizedBox(height: AppSpacing.md),
            const _DimensionPicker(),
            const SizedBox(height: AppSpacing.sm),
            const _RollupTable(),
          ],
        );
      },
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.pie_chart_outline, size: 48, color: Colors.grey),
            const SizedBox(height: AppSpacing.md),
            Text('No lots yet',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.sm),
            const Text(
              'Add a holding with its purchase price to see profit and loss '
              'broken down by sector.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }
}

/// Portfolio totals. Realised and unrealised are shown separately because
/// conflating them hides whether a gain has actually been banked.
class _TotalsCard extends ConsumerWidget {
  const _TotalsCard({required this.snap});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final xirr = ref.watch(portfolioXirrProvider).valueOrNull;
    final pct = snap.unrealisedPnlPct;

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Current value',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: 2),
          Text(
            Money.format(snap.marketValue),
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.lg,
            runSpacing: AppSpacing.sm,
            children: [
              _Stat(label: 'Invested', value: Money.format(snap.costBasis)),
              _Stat(
                label: 'Unrealised',
                value: _signed(snap.unrealisedPnl),
                valueColor: _pnlColor(snap.unrealisedPnl),
                sub: pct == null ? null : '${_pctText(pct)}%',
              ),
              _Stat(
                label: 'Realised',
                value: _signed(snap.realisedPnl),
                valueColor: _pnlColor(snap.realisedPnl),
              ),
              if (snap.dividendIncome > Decimal.zero)
                _Stat(
                  label: 'Dividends',
                  value: Money.format(snap.dividendIncome),
                ),
              _Stat(
                label: 'XIRR',
                // Never render a fabricated return: null means the solver had
                // nothing to work with.
                value: xirr == null
                    ? '—'
                    : '${(xirr * 100).toStringAsFixed(1)}%',
                valueColor: xirr == null
                    ? null
                    : (xirr >= 0 ? AppColors.income : AppColors.expense),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          _PriceAsOf(at: snap.lastPricedAt),
        ],
      ),
    );
  }
}

/// The "as of" line. With manually entered prices a P&L number without a date
/// is misleading, so this is never optional.
class _PriceAsOf extends StatelessWidget {
  const _PriceAsOf({required this.at});

  final DateTime? at;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodySmall?.copyWith(
        color: Theme.of(context).colorScheme.onSurfaceVariant,
        fontStyle: FontStyle.italic);
    if (at == null) {
      return Text('No prices recorded — showing cost, not value.', style: style);
    }
    final days = DateTime.now().difference(at!).inDays;
    final when = DateFormat('d MMM y').format(at!);
    final staleness = days <= 0
        ? 'today'
        : days == 1
            ? 'yesterday'
            : '$days days ago';
    return Text('Prices as of $when ($staleness)', style: style);
  }
}

class _UnpricedNotice extends StatelessWidget {
  const _UnpricedNotice({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Row(
        children: [
          const Icon(Icons.info_outline, size: 18, color: AppColors.budgetWarn),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              '$count holding${count == 1 ? '' : 's'} have no price yet, so they '
              'count at cost and contribute no profit or loss. Add a price to '
              'include them.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}

/// Allocation donut. Renders groups in the fixed validated order — see
/// [kAssetGroupOrder]; sorting by value would break the palette's colourblind
/// separation guarantees.
class _AllocationCard extends ConsumerWidget {
  const _AllocationCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(allocationProvider);
    if (rows.isEmpty) return const SizedBox.shrink();

    final total = rows.fold(Decimal.zero, (s, r) => s + r.marketValue);
    if (total == Decimal.zero) return const SizedBox.shrink();

    final segments = [
      for (final r in rows)
        DonutSegment(
          r.label,
          r.marketValue.toDouble(),
          groupColor(AssetGroup.values.firstWhere((g) => g.name == r.key)),
        ),
    ];
    final largest =
        rows.reduce((a, b) => b.marketValue > a.marketValue ? b : a);
    final pct =
        (largest.marketValue.toDouble() / total.toDouble() * 100).round();

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Allocation',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: AppSpacing.md),
          DonutChart(
            segments: segments,
            size: 140,
            strokeWidth: 22,
            centerText: '$pct%',
            centerSub: largest.label,
            // The legend is load-bearing, not decoration: three steps in this
            // palette sit below 3:1 contrast on the surface, so the labels are
            // what keep identity from resting on colour alone.
            showLegend: true,
          ),
        ],
      ),
    );
  }
}

class _DimensionPicker extends ConsumerWidget {
  const _DimensionPicker();

  static const _labels = {
    RollupDimension.sector: 'Sector',
    RollupDimension.industry: 'Industry',
    RollupDimension.marketCap: 'Market cap',
    RollupDimension.assetGroup: 'Asset class',
    RollupDimension.instrument: 'Holding',
    RollupDimension.currency: 'Currency',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(rollupDimensionProvider);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final entry in _labels.entries)
            Padding(
              padding: const EdgeInsets.only(right: AppSpacing.sm),
              child: ChoiceChip(
                label: Text(entry.value),
                selected: current == entry.key,
                onSelected: (_) => ref
                    .read(rollupDimensionProvider.notifier)
                    .state = entry.key,
              ),
            ),
        ],
      ),
    );
  }
}

/// The breakdown table. Sorted by value descending — safe here because a table
/// is read as a ranking; only the chart's colour adjacency must stay fixed.
class _RollupTable extends ConsumerWidget {
  const _RollupTable();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(rollupProvider);
    final snap = ref.watch(portfolioSnapshotProvider).valueOrNull;
    if (rows.isEmpty || snap == null) return const SizedBox.shrink();

    final total = snap.marketValue;

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            _RollupRowTile(row: rows[i], total: total),
            if (i < rows.length - 1) const Divider(height: 1),
          ],
          const Divider(height: 1, thickness: 1.4),
          // The reconciliation line. If these totals ever disagree with the
          // rows above, the roll-up is wrong — the unit tests assert they can't.
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: Row(
              children: [
                const Expanded(
                  child: Text('Total',
                      style: TextStyle(fontWeight: FontWeight.w800)),
                ),
                Text(Money.format(total),
                    style: const TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(width: AppSpacing.md),
                SizedBox(
                  width: 96,
                  child: Text(
                    _signed(snap.unrealisedPnl),
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: _pnlColor(snap.unrealisedPnl)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RollupRowTile extends StatelessWidget {
  const _RollupRowTile({required this.row, required this.total});

  final RollupRow row;
  final Decimal total;

  @override
  Widget build(BuildContext context) {
    final share = total == Decimal.zero
        ? 0.0
        : row.marketValue.toDouble() / total.toDouble();
    final pct = row.pnlPct;

    return Semantics(
      label: '${row.label}, value ${Money.toWords(row.marketValue)}, '
          '${row.pnl >= Decimal.zero ? "gain" : "loss"} '
          '${Money.toWords(row.pnl.abs())}',
      child: ExcludeSemantics(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          row.label,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${row.instrumentCount} holding'
                          '${row.instrumentCount == 1 ? '' : 's'}'
                          ' · ${(share * 100).toStringAsFixed(1)}%'
                          '${row.unpricedCount > 0 ? ' · ${row.unpricedCount} unpriced' : ''}',
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(Money.format(row.marketValue),
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 2),
                      Text('cost ${Money.format(row.costBasis)}',
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                  const SizedBox(width: AppSpacing.md),
                  SizedBox(
                    width: 96,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          _signed(row.pnl),
                          textAlign: TextAlign.right,
                          style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: _pnlColor(row.pnl)),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          // An undefined percentage is shown as a dash, never
                          // as 0%.
                          pct == null ? '—' : '${_pctText(pct)}%',
                          textAlign: TextAlign.right,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: _pnlColor(row.pnl)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(
                  value: share.clamp(0.0, 1.0),
                  minHeight: 4,
                  backgroundColor:
                      Theme.of(context).colorScheme.surfaceContainerHighest,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.label,
    required this.value,
    this.valueColor,
    this.sub,
  });

  final String label;
  final String value;
  final Color? valueColor;
  final String? sub;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant)),
        const SizedBox(height: 2),
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(value,
                style: TextStyle(
                    fontWeight: FontWeight.w700, color: valueColor)),
            if (sub != null) ...[
              const SizedBox(width: 4),
              Text(sub!,
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: valueColor)),
            ],
          ],
        ),
      ],
    );
  }
}

String _signed(Decimal v) =>
    '${v >= Decimal.zero ? '+' : '-'}${Money.format(v.abs())}';

String _pctText(Decimal pct) {
  final sign = pct >= Decimal.zero ? '+' : '-';
  return '$sign${pct.abs().toDouble().toStringAsFixed(2)}';
}

Color? _pnlColor(Decimal v) {
  if (v == Decimal.zero) return null;
  return v > Decimal.zero ? AppColors.income : AppColors.expense;
}
