import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/asset_group.dart';
import '../../../domain/services/portfolio_analytics.dart';
import '../../../domain/services/tax_rule_engine.dart';
import '../../../presentation/asset_group_colors.dart';
import '../../../presentation/app_shell.dart' show isDesktopPlatform;
import '../../../presentation/data_gate.dart';
import '../../../presentation/charts/sunburst_chart.dart';
import '../../../presentation/stat_tile.dart';
import '../../../presentation/glass_card.dart';
import '../providers/investment_providers.dart' show taxRuleEngineProvider;
import '../../../core/di/data_providers.dart' show currentVaultIdProvider;
import '../services/price_refresh_service.dart';
import '../widgets/market_data_card.dart';
import '../widgets/holdings_table.dart';
import '../widgets/portfolio_analytics.dart';
import '../providers/portfolio_providers.dart';

/// The portfolio home: totals, allocation, sector P&L, movers and every holding.
///
/// Reads the lot-level model ([portfolioSnapshotProvider]), so unlike the
/// previous version it can show cost basis, realised versus unrealised P&L, a
/// price date, and breakdowns. Two columns on desktop, one on phones.
class InvestmentsScreen extends ConsumerWidget {
  const InvestmentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('Investments'),
        actions: [
          IconButton(
            tooltip: 'Full breakdown',
            icon: const Icon(Icons.donut_small_outlined),
            onPressed: () => context.go(Routes.investmentsBreakdown),
          ),
          IconButton(
            tooltip: 'Analytics',
            icon: const Icon(Icons.insights_outlined),
            onPressed: () => context.go(Routes.analytics),
          ),
          const _RefreshPricesButton(),
          IconButton(
            tooltip: 'Import lots from a broker CSV',
            icon: const Icon(Icons.upload_file_outlined),
            onPressed: () => context.go(Routes.investmentsImportLots),
          ),
          Padding(
            padding: const EdgeInsets.only(
                left: AppSpacing.xs, right: AppSpacing.md),
            child: FilledButton.icon(
              onPressed: () => context.go(Routes.investmentsAddLot),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add lot'),
            ),
          ),
        ],
      ),
      body: const SafeArea(child: DataGate(child: _Body())),
      // Material's primary-action affordance. Desktop keeps the AppBar button,
      // where a floating control over a wide window reads as a stray element.
      floatingActionButton: isDesktopPlatform
          ? null
          : FloatingActionButton.extended(
              onPressed: () => context.go(Routes.investmentsAddLot),
              icon: const Icon(Icons.add),
              label: const Text('Add lot'),
            ),
    );
  }
}

/// Fetches prices, on demand and only on demand.
///
/// This is the app's only outbound network call. It is a button rather than
/// something that happens on open, because a background fetch would make the
/// app phone out on a schedule the user never agreed to — and the whole design
/// rests on it not doing that.
class _RefreshPricesButton extends ConsumerStatefulWidget {
  const _RefreshPricesButton();

  @override
  ConsumerState<_RefreshPricesButton> createState() =>
      _RefreshPricesButtonState();
}

class _RefreshPricesButtonState extends ConsumerState<_RefreshPricesButton> {
  bool _busy = false;

  Future<void> _refresh() async {
    setState(() => _busy = true);
    try {
      final service = await ref.read(priceRefreshServiceProvider.future);
      final result = await service.refresh();
      // Recorded even when nothing changed: "checked a minute ago and nothing
      // moved" and "not checked in a week" look identical on screen otherwise.
      await recordPriceRefresh(ref.read(currentVaultIdProvider));
      ref.invalidate(lastPriceRefreshProvider);
      // Force a re-read: prices are fetched per snapshot build rather than
      // streamed, so nothing else would notice they changed.
      ref.invalidate(portfolioSnapshotProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_describe(result))),
      );
    } on Object catch (e) {
      await recordPriceRefresh(ref.read(currentVaultIdProvider));
      ref.invalidate(lastPriceRefreshProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Could not refresh prices: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Reports what happened, including the parts that did not work.
  static String _describe(PriceRefreshResult r) {
    if (r.didNothing && r.failures.isEmpty) {
      return r.skipped > 0
          ? 'Nothing to refresh — ${r.skipped} holding'
              '${r.skipped == 1 ? '' : 's'} priced manually.'
          : 'Nothing to refresh.';
    }
    final parts = <String>[
      if (r.updated > 0) 'Updated ${r.updated}',
      // Named rather than silently folded into a success count: a partial
      // refresh that reports "Updated 8" while quietly failing on two is how a
      // stale price gets mistaken for a fresh one.
      if (r.failures.isNotEmpty) '${r.failures.length} unavailable',
      if (r.skipped > 0) '${r.skipped} priced manually',
    ];
    return parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Refresh prices',
      onPressed: _busy ? null : _refresh,
      icon: _busy
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.refresh),
    );
  }
}

/// Import entry points, given the weight the plan asks for.
///
/// Statement import is the primary way a real portfolio gets in — typing years
/// of trades by hand is not something anyone does — so it belongs in the body
/// rather than behind an AppBar icon.
class _ImportBar extends StatelessWidget {
  const _ImportBar();

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return GlassCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: AppColors.accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(11),
            ),
            child: const Icon(Icons.description_outlined,
                color: AppColors.accent, size: 19),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Import your holdings',
                    style:
                        text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                Text(
                  'Broker CSV. Nothing is written until you review it.',
                  style: text.labelSmall
                      ?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          FilledButton(
            onPressed: () => context.go(Routes.investmentsImportLots),
            child: const Text('Import'),
          ),
        ],
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(portfolioSnapshotProvider);

    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => _ErrorState(message: '$e'),
      data: (snap) {
        if (snap.positions.isEmpty && snap.disposals.isEmpty) {
          return const _EmptyState();
        }
        final wide = MediaQuery.sizeOf(context).width >= 1000;
        return ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            _StatGrid(snap: snap),
            const SizedBox(height: AppSpacing.md),
            const _ImportBar(),
            const SizedBox(height: AppSpacing.md),
            const _Notices(),
            _MarketData(snap: snap),
            const SizedBox(height: AppSpacing.md),
            if (wide)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      children: [
                        _AllocationCard(snap: snap),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      children: [
                        _SectorPnlCard(snap: snap),
                        const SizedBox(height: AppSpacing.md),
                        _MoversCard(snap: snap),
                      ],
                    ),
                  ),
                ],
              )
            else ...[
              _AllocationCard(snap: snap),
              const SizedBox(height: AppSpacing.md),
              _SectorPnlCard(snap: snap),
              const SizedBox(height: AppSpacing.md),
              _MoversCard(snap: snap),
            ],
            const SizedBox(height: AppSpacing.md),

            // Allocation family: current value, cost, asset type, sector.
            if (wide)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: CostVsValueCard(snap: snap)),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: GroupAllocationCard(
                      snap: snap,
                      title: 'Asset type',
                      by: (p) => p.instrument.kind.label,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: GroupAllocationCard(
                      snap: snap,
                      title: 'Sector',
                      by: (p) => p.instrument.sectorCode,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: GroupAllocationCard(
                      snap: snap,
                      title: 'Market cap',
                      by: (p) => p.instrument.marketCapBand?.label,
                    ),
                  ),
                ],
              )
            else ...[
              CostVsValueCard(snap: snap),
              const SizedBox(height: AppSpacing.md),
              GroupAllocationCard(
                  snap: snap,
                  title: 'Asset type',
                  by: (p) => p.instrument.kind.label),
              const SizedBox(height: AppSpacing.md),
              GroupAllocationCard(
                  snap: snap,
                  title: 'Sector',
                  by: (p) => p.instrument.sectorCode),
              const SizedBox(height: AppSpacing.md),
              GroupAllocationCard(
                  snap: snap,
                  title: 'Market cap',
                  by: (p) => p.instrument.marketCapBand?.label),
            ],
            const SizedBox(height: AppSpacing.md),

            // Winners and losers, ranked by return.
            if (wide)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: GainersLosersCard(snap: snap)),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                      child: GainersLosersCard(snap: snap, gainers: false)),
                ],
              )
            else ...[
              GainersLosersCard(snap: snap),
              const SizedBox(height: AppSpacing.md),
              GainersLosersCard(snap: snap, gainers: false),
            ],
            const SizedBox(height: AppSpacing.md),

            // Gain-and-loss and the value ranking span the full width: their
            // bars are horizontal, so length IS the reading and halving the
            // width halves the resolution of every comparison on them.
            PnlByHoldingCard(snap: snap),
            const SizedBox(height: AppSpacing.md),
            DayChangeCard(snap: snap),
            const SizedBox(height: AppSpacing.md),
            ValueDistributionCard(snap: snap),
            const SizedBox(height: AppSpacing.md),
            if (wide)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: WinnersLosersCard(snap: snap)),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(child: DiversificationCard(snap: snap)),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(flex: 2, child: PortfolioInsightsCard(snap: snap)),
                ],
              )
            else ...[
              WinnersLosersCard(snap: snap),
              const SizedBox(height: AppSpacing.md),
              DiversificationCard(snap: snap),
              const SizedBox(height: AppSpacing.md),
              PortfolioInsightsCard(snap: snap),
            ],
            const SizedBox(height: AppSpacing.md),
            ReturnDistributionCard(snap: snap),
            const SizedBox(height: AppSpacing.md),
            HoldingsTable(snap: snap),
            const SizedBox(height: AppSpacing.md),
            _HoldingsCard(snap: snap),
            // Clearance for the FAB.
            const SizedBox(height: 88),
          ],
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

class _StatGrid extends ConsumerWidget {
  const _StatGrid({required this.snap});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final xirr = ref.watch(portfolioXirrProvider).valueOrNull;
    final pct = snap.unrealisedPnlPct;

    final tiles = <Widget>[
      StatTile(
        label: 'Current value',
        value: Money.format(snap.marketValue),
        emphasise: true,
        footer: _asOfText(snap.lastPricedAt) ?? 'No prices recorded',
      ),
      StatTile(label: 'Invested', value: Money.format(snap.costBasis)),
      StatTile(
        label: 'Unrealised P&L',
        value: _signed(snap.unrealisedPnl),
        valueColor: _pnlColor(snap.unrealisedPnl),
        footer: pct == null ? null : '${_pctText(pct)}%',
      ),
      StatTile(
        label: 'Realised P&L',
        value: _signed(snap.realisedPnl),
        valueColor: _pnlColor(snap.realisedPnl),
        footer: snap.disposals.isEmpty
            ? 'No sales yet'
            : '${snap.disposals.length} disposal'
                '${snap.disposals.length == 1 ? '' : 's'}',
      ),
      StatTile(
        label: 'XIRR',
        // Null means the solver had nothing to work with. Never invent a return.
        value: xirr == null ? '—' : '${(xirr * 100).toStringAsFixed(1)}%',
        valueColor: xirr == null
            ? null
            : (xirr >= 0 ? AppColors.income : AppColors.expense),
        footer: xirr == null ? 'Needs dated lots' : 'Annualised',
      ),
      StatTile(
        label: 'Dividends',
        value: Money.format(snap.dividendIncome),
        footer: 'Counted in XIRR',
      ),
    ];

    return LayoutBuilder(
      builder: (context, c) {
        final columns = c.maxWidth >= 1000
            ? 6
            : c.maxWidth >= 700
                ? 3
                : 2;
        return GridView.count(
          crossAxisCount: columns,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: AppSpacing.sm,
          crossAxisSpacing: AppSpacing.sm,
          childAspectRatio: columns >= 6 ? 1.3 : 1.6,
          children: tiles,
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Disclosure banners
// ---------------------------------------------------------------------------

class _Notices extends ConsumerWidget {
  const _Notices();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final snap = ref.watch(portfolioSnapshotProvider).valueOrNull;
    final unreviewed = ref.watch(unreviewedLotCountProvider).valueOrNull ?? 0;
    final totals = ref.watch(investmentTotalsProvider).valueOrNull;
    if (snap == null) return const SizedBox.shrink();

    final unconverted = totals?.unconvertedCurrencies ?? const <String>{};

    final notices = <Widget>[
      // Loudest, because it is the only notice about a number being WRONG
      // rather than imprecise: those holdings are missing from the total
      // entirely, and a silently smaller net worth is worse than an obvious
      // gap.
      if (unconverted.isNotEmpty)
        _Notice(
          icon: Icons.currency_exchange,
          text: 'Holdings in ${unconverted.join(', ')} are not in your totals '
              '— no exchange rate stored. Fetch rates in Settings > Currency.',
        ),
      if (snap.unpriced.isNotEmpty)
        _Notice(
          icon: Icons.help_outline,
          text: '${snap.unpriced.length} holding'
              '${snap.unpriced.length == 1 ? '' : 's'} have no price, so they '
              'count at cost and show no profit or loss.',
        ),
      if (unreviewed > 0)
        _Notice(
          icon: Icons.fact_check_outlined,
          text: '$unreviewed imported lot${unreviewed == 1 ? '' : 's'} still '
              'need confirming. Their figures are provisional until reviewed.',
        ),
    ];

    if (notices.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        for (final n in notices) ...[n, const SizedBox(height: AppSpacing.sm)],
      ],
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.budgetWarn),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(text, style: Theme.of(context).textTheme.bodySmall),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

class _AllocationCard extends ConsumerWidget {
  const _AllocationCard({required this.snap});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const analytics = PortfolioAnalytics();
    if (snap.positions.isEmpty || snap.marketValue <= Decimal.zero) {
      return const SizedBox.shrink();
    }

    final dark = Theme.of(context).brightness == Brightness.dark;
    // Groups come back in the fixed validated order and are never sorted —
    // see kAssetGroupOrder. Children inherit the parent's hue at successive
    // lightness steps, keyed on their position in the roll-up rather than on
    // value, so a price move does not repaint the chart.
    final nodes = analytics.sunburst(snap.positions);
    final root = SunburstNode(
      key: 'portfolio',
      label: 'Portfolio',
      value: snap.marketValue.toDouble(),
      color: Colors.transparent,
      children: [
        for (final n in nodes)
          () {
            final group =
                AssetGroup.values.firstWhere((g) => g.name == n.row.key);
            final shades = groupShades(group, n.children.length, dark: dark);
            // Anything past the ramp's cap shares its last step; the labels in
            // the caption and legend are what keep them apart.
            return SunburstNode(
              key: n.row.key,
              label: n.row.label,
              value: n.row.marketValue.toDouble(),
              color: groupColor(group),
              children: [
                for (var i = 0; i < n.children.length; i++)
                  SunburstNode(
                    key: n.children[i].key,
                    label: n.children[i].label,
                    value: n.children[i].marketValue.toDouble(),
                    color: shades[i.clamp(0, shades.length - 1)],
                  ),
              ],
            );
          }(),
      ],
    );

    final unclassified = ref.watch(unclassifiedShareProvider);

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _CardTitle('Allocation'),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Asset class, then sector inside it. Tap a slice to zoom in.',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpacing.md),
          SunburstChart(
            root: root,
            size: 220,
            formatValue: (v) =>
                Money.format(Decimal.parse(v.toStringAsFixed(2))),
          ),
          if (unclassified != null && unclassified > 0.15) ...[
            const SizedBox(height: AppSpacing.sm),
            // Said out loud rather than shown as a large grey wedge with no
            // explanation. The classification table is a starter set, and a
            // portfolio outside it is the app's gap, not the user's.
            Text(
              '${(unclassified * 100).round()}% of your holdings have no sector '
              'yet — set one from a holding to sharpen this.',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Sector P&L
// ---------------------------------------------------------------------------

class _SectorPnlCard extends StatelessWidget {
  const _SectorPnlCard({required this.snap});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context) {
    const analytics = PortfolioAnalytics();
    final rows = analytics.rollup(snap.positions, RollupDimension.sector);
    if (rows.isEmpty) return const SizedBox.shrink();

    final shown = rows.take(6).toList();

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(child: _CardTitle('Profit & loss by sector')),
              TextButton(
                onPressed: () => context.go(Routes.investmentsBreakdown),
                child: const Text('All'),
              ),
            ],
          ),
          for (final r in shown) _RollupRowTile(row: r, total: snap.marketValue),
          if (rows.length > shown.length)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Text(
                '+${rows.length - shown.length} more sector'
                '${rows.length - shown.length == 1 ? '' : 's'}',
                style: Theme.of(context).textTheme.bodySmall,
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

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  row.label,
                  style: const TextStyle(
                      fontWeight: FontWeight.w600, fontSize: 13.5),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(Money.format(row.marketValue),
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 13.5)),
              const SizedBox(width: AppSpacing.sm),
              SizedBox(
                width: 74,
                child: Text(
                  pct == null ? '—' : '${_pctText(pct)}%',
                  textAlign: TextAlign.right,
                  style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                      color: _pnlColor(row.pnl)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
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
    );
  }
}

// ---------------------------------------------------------------------------
// Market cap
// ---------------------------------------------------------------------------

class _MoversCard extends StatelessWidget {
  const _MoversCard({required this.snap});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context) {
    // Only priced positions can move; an unpriced one sits flat at cost and
    // would crowd out real movers with a meaningless 0%.
    final priced = snap.positions.where((p) => !p.isUnpriced).toList();
    if (priced.isEmpty) return const SizedBox.shrink();

    final sorted = [...priced]
      ..sort((a, b) => _pctOf(b).compareTo(_pctOf(a)));
    final best = sorted.take(3).toList();
    final worst =
        sorted.reversed.take(3).where((p) => !best.contains(p)).toList();

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _CardTitle('Movers'),
          const SizedBox(height: AppSpacing.xs),
          for (final p in best) _MoverRow(position: p, pct: _pctOf(p)),
          if (worst.isNotEmpty) ...[
            const Divider(height: AppSpacing.md),
            for (final p in worst) _MoverRow(position: p, pct: _pctOf(p)),
          ],
        ],
      ),
    );
  }

  static double _pctOf(Position p) => p.costBasis == Decimal.zero
      ? 0
      : p.unrealisedPnl.toDouble() / p.costBasis.toDouble() * 100;
}

class _MoverRow extends StatelessWidget {
  const _MoverRow({required this.position, required this.pct});

  final Position position;
  final double pct;

  @override
  Widget build(BuildContext context) {
    final up = pct >= 0;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Icon(up ? Icons.arrow_upward : Icons.arrow_downward,
              size: 14, color: up ? AppColors.income : AppColors.expense),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              position.instrument.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style:
                  const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5),
            ),
          ),
          Text(
            '${up ? '+' : ''}${pct.toStringAsFixed(2)}%',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: up ? AppColors.income : AppColors.expense,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

class _HoldingsCard extends StatelessWidget {
  const _HoldingsCard({required this.snap});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context) {
    // Sorted by value: a table is read as a ranking. Only the chart's colour
    // adjacency has to stay fixed.
    final positions = [...snap.positions]
      ..sort((a, b) => b.marketValue.compareTo(a.marketValue));

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _CardTitle('Holdings (${positions.length})'),
          const SizedBox(height: AppSpacing.xs),
          if (positions.isEmpty)
            Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Text(
                'Every position has been sold. Realised profit and loss is in '
                'the totals above.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            )
          else
            // No 5-row cap: the previous screen truncated the list and its
            // "See all" button was wired to nothing.
            for (var i = 0; i < positions.length; i++) ...[
              _PositionTile(position: positions[i]),
              if (i < positions.length - 1) const Divider(height: 1),
            ],
        ],
      ),
    );
  }
}

class _PositionTile extends ConsumerWidget {
  const _PositionTile({required this.position});

  final Position position;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = position;
    final scheme = Theme.of(context).colorScheme;
    final pctRaw = p.costBasis == Decimal.zero
        ? null
        : p.unrealisedPnl.toDouble() / p.costBasis.toDouble() * 100;

    return ExpansionTile(
      tilePadding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      childrenPadding: const EdgeInsets.only(
          left: AppSpacing.md, right: AppSpacing.md, bottom: AppSpacing.sm),
      title: Row(
        children: [
          Expanded(
            flex: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        p.instrument.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (p.hasUnreviewedLots) ...[
                      const SizedBox(width: 6),
                      const Tooltip(
                        message: 'Contains lots awaiting review',
                        child: Icon(Icons.fact_check_outlined,
                            size: 13, color: AppColors.budgetWarn),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    '${p.quantity} @ ${Money.format(p.avgCost)}',
                    if (p.instrument.sector != null) p.instrument.sector!,
                    p.instrument.kind.label,
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 2,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(Money.format(p.marketValue),
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  p.isUnpriced
                      ? 'at cost — no price'
                      : '${_signed(p.unrealisedPnl)}'
                          '${pctRaw == null ? '' : ' (${pctRaw >= 0 ? '+' : ''}${pctRaw.toStringAsFixed(2)}%)'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: p.isUnpriced
                            ? scheme.onSurfaceVariant
                            : _pnlColor(p.unrealisedPnl),
                        fontWeight: FontWeight.w600,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
      children: [
        _DetailRow('Invested', Money.format(p.costBasis)),
        _DetailRow('Average cost', Money.format(p.avgCost)),
        _DetailRow('Current price',
            p.price == null ? 'Not set' : Money.format(p.price!)),
        _DetailRow('Price as of', _asOfText(p.pricedAt) ?? 'Never'),
        if (p.instrument.industry != null)
          _DetailRow('Industry', p.instrument.industry!),
        if (p.instrument.marketCapBand != null)
          _DetailRow('Market cap', p.instrument.marketCapBand!.label),
        if (p.instrument.isin != null) _DetailRow('ISIN', p.instrument.isin!),
        _TaxEstimate(position: p),
        const Divider(height: AppSpacing.md),
        Align(
          alignment: Alignment.centerLeft,
          child: Text('Lots (${p.lots.length})',
              style:
                  const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
        ),
        const SizedBox(height: 4),
        for (final lot in p.lots)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '${lot.quantity} @ ${Money.format(lot.unitCost)}'
                    ' · ${DateFormat('d MMM y').format(lot.tradeDate)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                if (!lot.isReviewed)
                  Text('unreviewed',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: AppColors.budgetWarn,
                          fontWeight: FontWeight.w700)),
              ],
            ),
          ),
      ],
    );
  }
}

/// "If sold today" capital-gains estimate, kept from the previous screen.
///
/// Uses the OLDEST lot's date, which is what FIFO would actually sell first, so
/// the holding period shown is the one that would apply. Slab rates are never
/// guessed — the engine reports "as per slab" instead.
class _TaxEstimate extends ConsumerWidget {
  const _TaxEstimate({required this.position});

  final Position position;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final engine = ref.watch(taxRuleEngineProvider).valueOrNull;
    final p = position;
    if (engine == null || p.isUnpriced || p.lots.isEmpty) {
      return const SizedBox.shrink();
    }

    final oldest = p.lots
        .map((l) => l.tradeDate)
        .reduce((a, b) => a.isBefore(b) ? a : b);

    final GainResult r;
    try {
      r = engine.computeGain(
        assetType: p.instrument.kind,
        firstPurchaseDate: oldest,
        saleDate: DateTime.now(),
        buyValue: p.costBasis,
        saleValue: p.marketValue,
      );
    } on Object {
      // A missing rule for this asset type must not break the row.
      return const SizedBox.shrink();
    }

    final term = r.gainType == GainType.longTerm ? 'Long-term' : 'Short-term';
    return _DetailRow(
      'If sold today',
      '$term · ${r.isSlab ? 'tax as per slab' : Money.format(r.estimatedTax)}',
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ),
          Flexible(
            child: Text(value,
                textAlign: TextAlign.right,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// States & helpers
// ---------------------------------------------------------------------------

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.trending_up, size: 52, color: Colors.grey),
              const SizedBox(height: AppSpacing.md),
              Text('No holdings yet',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Add a lot with its purchase price and charges, or import a '
                'broker CSV. Profit and loss by sector appears as soon as you '
                'record a current price.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: AppSpacing.lg),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                alignment: WrapAlignment.center,
                children: [
                  FilledButton.icon(
                    onPressed: () => context.go(Routes.investmentsAddLot),
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('Add lot'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => context.go(Routes.investmentsImportLots),
                    icon: const Icon(Icons.upload_file_outlined, size: 18),
                    label: const Text('Import CSV'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 44, color: AppColors.expense),
            const SizedBox(height: AppSpacing.md),
            Text('Could not load the portfolio',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.sm),
            Text(message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

class _CardTitle extends StatelessWidget {
  const _CardTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: Theme.of(context)
            .textTheme
            .titleSmall
            ?.copyWith(fontWeight: FontWeight.w700),
      );
}

String _signed(Decimal v) =>
    '${v >= Decimal.zero ? '+' : '-'}${Money.format(v.abs())}';

String _pctText(Decimal pct) =>
    '${pct >= Decimal.zero ? '+' : '-'}${pct.abs().toDouble().toStringAsFixed(2)}';

Color? _pnlColor(Decimal v) {
  if (v == Decimal.zero) return null;
  return v > Decimal.zero ? AppColors.income : AppColors.expense;
}

/// "as of" text for a price observation. Never omitted where a value is shown:
/// with manually entered prices, a figure without a date is misleading.
String? _asOfText(DateTime? at) {
  if (at == null) return null;
  final days = DateTime.now().difference(at).inDays;
  final when = DateFormat('d MMM').format(at);
  if (days <= 0) return 'Priced today';
  if (days == 1) return 'Priced yesterday';
  return 'Priced $when ($days days ago)';
}


/// Binds the market-data card to the last-refresh timestamp and hands it the
/// existing refresh control, so there is still exactly one code path that
/// touches the network.
class _MarketData extends ConsumerWidget {
  const _MarketData({required this.snap});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MarketDataCard(
      snap: snap,
      lastRefreshedAt: ref.watch(lastPriceRefreshProvider).valueOrNull,
      refreshButton: const _RefreshPricesButton(),
    );
  }
}
