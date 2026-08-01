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
import '../../../presentation/data_gate.dart';
import '../../../presentation/charts/donut_chart.dart';
import '../../../presentation/stat_tile.dart';
import '../../../presentation/glass_card.dart';
import '../providers/investment_providers.dart' show taxRuleEngineProvider;
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
            const _Notices(),
            if (wide)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      children: [
                        _AllocationCard(snap: snap),
                        const SizedBox(height: AppSpacing.md),
                        _MarketCapCard(snap: snap),
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
              _MarketCapCard(snap: snap),
              const SizedBox(height: AppSpacing.md),
              _MoversCard(snap: snap),
            ],
            const SizedBox(height: AppSpacing.md),
            _HoldingsCard(snap: snap),
            const SizedBox(height: AppSpacing.xl),
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
    if (snap == null) return const SizedBox.shrink();

    final notices = <Widget>[
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

class _AllocationCard extends StatelessWidget {
  const _AllocationCard({required this.snap});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context) {
    const analytics = PortfolioAnalytics();
    // Fixed validated order, never value-sorted — see kAssetGroupOrder.
    final rows = analytics.allocationByGroup(snap.positions);
    if (rows.isEmpty) return const SizedBox.shrink();

    final total = rows.fold(Decimal.zero, (s, r) => s + r.marketValue);
    if (total == Decimal.zero) return const SizedBox.shrink();

    final largest =
        rows.reduce((a, b) => b.marketValue > a.marketValue ? b : a);
    final pct =
        (largest.marketValue.toDouble() / total.toDouble() * 100).round();

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _CardTitle('Allocation'),
          const SizedBox(height: AppSpacing.md),
          Center(
            child: DonutChart(
              segments: [
                for (final r in rows)
                  DonutSegment(
                    r.label,
                    r.marketValue.toDouble(),
                    groupColor(
                        AssetGroup.values.firstWhere((g) => g.name == r.key)),
                  ),
              ],
              size: 150,
              strokeWidth: 24,
              centerText: '$pct%',
              centerSub: largest.label,
              // The legend is load-bearing: three palette steps sit below 3:1
              // contrast, so labels keep identity off colour alone.
              showLegend: true,
            ),
          ),
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

class _MarketCapCard extends StatelessWidget {
  const _MarketCapCard({required this.snap});

  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context) {
    const analytics = PortfolioAnalytics();
    final rows = analytics.rollup(snap.positions, RollupDimension.marketCap);
    if (rows.isEmpty) return const SizedBox.shrink();

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _CardTitle('Market cap'),
          const SizedBox(height: AppSpacing.xs),
          for (final r in rows) _RollupRowTile(row: r, total: snap.marketValue),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Movers
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
