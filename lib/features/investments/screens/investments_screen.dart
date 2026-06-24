import 'dart:math' as math;

import 'package:decimal/decimal.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/holding.dart';
import '../../../domain/services/portfolio_diff.dart';
import '../../../domain/services/tax_rule_engine.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/donut_chart.dart';
import '../../../presentation/glass_card.dart';
import '../../import/broker_parser.dart'
    show IBrokerParser, UpstoxCsvParser, ZerodhaXlsxParser;
import '../providers/investment_providers.dart';

// ---------------------------------------------------------------------------
// Screen root
// ---------------------------------------------------------------------------

class InvestmentsScreen extends StatelessWidget {
  const InvestmentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('Investments'),
        actions: const [_RefreshPricesButton()],
      ),
      body: const SafeArea(child: DataGate(child: _InvestmentsBody())),
    );
  }
}

// ---------------------------------------------------------------------------
// Refresh-prices action button (original behavior unchanged)
// ---------------------------------------------------------------------------

class _RefreshPricesButton extends ConsumerStatefulWidget {
  const _RefreshPricesButton();

  @override
  ConsumerState<_RefreshPricesButton> createState() => _RefreshState();
}

class _RefreshState extends ConsumerState<_RefreshPricesButton> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Refresh live prices',
      icon: _busy
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.refresh),
      onPressed: _busy
          ? null
          : () async {
              final messenger = ScaffoldMessenger.of(context);
              setState(() => _busy = true);
              final source =
                  await ref.read(portfolioImportProvider).refreshPrices();
              if (mounted) setState(() => _busy = false);
              messenger.showSnackBar(SnackBar(
                content: Text(source == null
                    ? 'Prices unavailable (offline or no provider).'
                    : 'Prices updated via $source.'),
              ));
            },
    );
  }
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

class _InvestmentsBody extends ConsumerWidget {
  const _InvestmentsBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final holdings = ref.watch(holdingListProvider).valueOrNull ?? const [];
    final invested =
        holdings.fold(Decimal.zero, (s, h) => s + h.investedValue);
    final market = holdings.fold(Decimal.zero, (s, h) => s + h.marketValue);
    final gain = market - invested;

    return ListView(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      children: [
        // 1. Portfolio hero card.
        _PortfolioHeroCard(
            market: market, gain: gain, invested: invested),
        const SizedBox(height: AppSpacing.md),

        // 2. Allocation donut.
        if (holdings.isNotEmpty) ...[
          _AllocationCard(holdings: holdings),
          const SizedBox(height: AppSpacing.md),
        ],

        // 3. Holdings list.
        _HoldingsCard(holdings: holdings, ref: ref),
        const SizedBox(height: AppSpacing.md),

        // 4. Import buttons (original behavior).
        _ImportButtons(ref: ref),
        const SizedBox(height: AppSpacing.lg),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Portfolio hero card
// ---------------------------------------------------------------------------

class _PortfolioHeroCard extends StatelessWidget {
  const _PortfolioHeroCard({
    required this.market,
    required this.gain,
    required this.invested,
  });

  final Decimal market;
  final Decimal gain;
  final Decimal invested;

  String _pnlLabel() {
    final arrow = gain >= Decimal.zero ? '▲' : '▼';
    final pct = invested == Decimal.zero
        ? '0.00'
        : (gain.toDouble() / invested.toDouble() * 100).abs().toStringAsFixed(2);
    return '$arrow ${Money.format(gain.abs())} ($pct%)';
  }

  @override
  Widget build(BuildContext context) {
    final gainPositive = gain >= Decimal.zero;
    final pnlColor =
        gainPositive ? const Color(0xFF6EE7B7) : const Color(0xFFFCA5A5);

    return Semantics(
      label:
          'Total portfolio value ${Money.toWords(market)}, '
          'gain ${gain >= Decimal.zero ? "positive" : "negative"} ${Money.toWords(gain.abs())}',
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadii.card),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: AppColors.accentGradient,
          ),
          boxShadow: [
            BoxShadow(
              color: AppColors.accentDeep.withValues(alpha: 0.40),
              blurRadius: 32,
              offset: const Offset(0, 16),
            ),
          ],
        ),
        child: ExcludeSemantics(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.pie_chart_outline,
                      color: Colors.white70, size: 16),
                  const SizedBox(width: AppSpacing.xs),
                  Text(
                    'TOTAL PORTFOLIO VALUE',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Colors.white70,
                          letterSpacing: 1.4,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  Money.format(market),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 36,
                    fontWeight: FontWeight.w800,
                    height: 1.05,
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Row(
                children: [
                  Icon(
                    gainPositive
                        ? Icons.arrow_upward_rounded
                        : Icons.arrow_downward_rounded,
                    color: pnlColor,
                    size: 14,
                  ),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      _pnlLabel(),
                      style: TextStyle(
                        color: pnlColor,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
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

// ---------------------------------------------------------------------------
// 2. Allocation card
// ---------------------------------------------------------------------------

const _kViolet = Color(0xFF8B5CF6);

Color _assetColor(AssetType t) => switch (t) {
      AssetType.equityEtf => AppColors.accent,
      AssetType.goldEtf => AppColors.budgetWarn,
      AssetType.debtMf => _kViolet,
      AssetType.realEstate => AppColors.income,
    };

String _assetLabel(AssetType t) => switch (t) {
      AssetType.equityEtf => 'Equity',
      AssetType.goldEtf => 'Gold',
      AssetType.debtMf => 'Debt',
      AssetType.realEstate => 'Real Estate',
    };

class _AllocationCard extends StatelessWidget {
  const _AllocationCard({required this.holdings});

  final List<Holding> holdings;

  @override
  Widget build(BuildContext context) {
    // Group by asset type.
    final grouped = <AssetType, Decimal>{};
    for (final h in holdings) {
      grouped[h.assetType] =
          (grouped[h.assetType] ?? Decimal.zero) + h.marketValue;
    }

    final total =
        grouped.values.fold(Decimal.zero, (s, v) => s + v);
    if (total == Decimal.zero) return const SizedBox.shrink();

    // Sort descending by value; build segments.
    final sorted = grouped.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final segments = [
      for (final e in sorted)
        DonutSegment(
          _assetLabel(e.key),
          e.value.toDouble(),
          _assetColor(e.key),
        ),
    ];

    // Largest slice for center label.
    final largest = sorted.first;
    final largestPct =
        (largest.value.toDouble() / total.toDouble() * 100).round();

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Allocation',
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppSpacing.md),
          DonutChart(
            segments: segments,
            size: 140,
            strokeWidth: 22,
            centerText: '$largestPct%',
            centerSub: _assetLabel(largest.key),
            showLegend: true,
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Holdings card
// ---------------------------------------------------------------------------

class _HoldingsCard extends StatelessWidget {
  const _HoldingsCard({required this.holdings, required this.ref});

  final List<Holding> holdings;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    // Show first 5 with a "See all" affordance if more.
    const previewCount = 5;
    final slice = holdings.take(previewCount).toList();
    final hasMore = holdings.length > previewCount;

    return GlassCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg, AppSpacing.lg, AppSpacing.md, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Holdings (${holdings.length})',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                if (hasMore)
                  SizedBox(
                    height: AppSpacing.minTouchTarget,
                    child: TextButton(
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.sm),
                        minimumSize:
                            const Size(0, AppSpacing.minTouchTarget),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      onPressed: () {}, // parent wires nav if needed
                      child: const Text(
                        'See all',
                        style: TextStyle(
                          color: AppColors.accent,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          if (holdings.isEmpty)
            const Padding(
              padding: EdgeInsets.all(AppSpacing.lg),
              child: Center(
                child: Text(
                  'No holdings. Import from Zerodha or Upstox.',
                  style: TextStyle(color: Colors.grey),
                  textAlign: TextAlign.center,
                ),
              ),
            )
          else
            for (var i = 0; i < slice.length; i++) ...[
              _HoldingRow(
                holding: slice[i],
                onTap: () =>
                    _showTaxEstimate(context, ref, slice[i]),
              ),
              if (i < slice.length - 1)
                const Divider(height: 1, indent: 16, endIndent: 16),
            ],
          const SizedBox(height: AppSpacing.sm),
        ],
      ),
    );
  }

  Future<void> _showTaxEstimate(
      BuildContext context, WidgetRef ref, Holding h) async {
    final engine = await ref.read(taxRuleEngineProvider.future);
    if (!context.mounted) return;
    final gain = engine.computeGain(
      assetType: h.assetType,
      firstPurchaseDate: h.firstPurchaseDate,
      saleDate: DateTime.now(),
      buyValue: h.investedValue,
      saleValue: h.marketValue,
    );
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${h.symbol} — capital gains'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
                'Type: ${gain.gainType == GainType.longTerm ? "Long-term" : "Short-term"}'),
            Text('Gain: ${Money.format(gain.gainAmount)}'),
            Text('Applicable rate: ${gain.rateLabel}'),
            Text(
                'Estimated tax: ${gain.isSlab ? "—" : Money.format(gain.estimatedTax)}'),
            const SizedBox(height: AppSpacing.md),
            const Text(
              'Estimates only. Consult a CA for tax filing.',
              style: TextStyle(fontStyle: FontStyle.italic, fontSize: 12),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close')),
        ],
      ),
    );
  }
}

class _HoldingRow extends StatelessWidget {
  const _HoldingRow({required this.holding, required this.onTap});

  final Holding holding;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final gain = holding.unrealisedPnl;
    final gainPositive = gain >= Decimal.zero;
    final pillColor =
        gainPositive ? AppColors.income : AppColors.expense;
    final pillBg = pillColor.withValues(alpha: 0.12);

    final pctStr = holding.investedValue == Decimal.zero
        ? '0.00'
        : (gain.toDouble() /
                    holding.investedValue.toDouble() *
                    100)
                .abs()
                .toStringAsFixed(2);

    final gainLabel =
        '${gainPositive ? "+" : "-"}${Money.format(gain.abs())} ($pctStr%)';

    return Semantics(
      label:
          '${holding.symbol}, market value ${Money.toWords(holding.marketValue)}, '
          'gain ${gainPositive ? "positive" : "negative"} ${Money.toWords(gain.abs())}',
      button: true,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg, vertical: AppSpacing.md),
          child: ExcludeSemantics(
            child: Row(
              children: [
                // Symbol badge.
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: AppColors.accent.withValues(alpha: 0.18)),
                  ),
                  child: Center(
                    child: Text(
                      holding.symbol.substring(
                          0, math.min(3, holding.symbol.length)),
                      style: const TextStyle(
                        color: AppColors.accentGlow,
                        fontWeight: FontWeight.w800,
                        fontSize: 11,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                // Symbol + meta.
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        holding.symbol,
                        style: Theme.of(context)
                            .textTheme
                            .bodyMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${holding.quantity} Qty · Avg ${Money.format(holding.avgCost)}',
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant,
                            ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                // Value + P&L pill.
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      Money.format(holding.marketValue),
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: pillBg,
                        borderRadius:
                            BorderRadius.circular(AppRadii.pill),
                      ),
                      child: Text(
                        gainLabel,
                        style: TextStyle(
                          color: pillColor,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Import buttons (original handlers, polished style)
// ---------------------------------------------------------------------------

class _ImportButtons extends StatelessWidget {
  const _ImportButtons({required this.ref});

  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () => _import(
              context,
              ref,
              parser: const ZerodhaXlsxParser(),
              extensions: ['xlsx', 'xls'],
            ),
            icon: const Icon(Icons.upload_file, size: 18),
            label: const Text('Zerodha XLSX'),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () => _import(
              context,
              ref,
              parser: const UpstoxCsvParser(),
              extensions: ['csv'],
            ),
            icon: const Icon(Icons.upload_file, size: 18),
            label: const Text('Upstox CSV'),
          ),
        ),
      ],
    );
  }

  Future<void> _import(
    BuildContext context,
    WidgetRef ref, {
    required IBrokerParser parser,
    required List<String> extensions,
  }) async {
    final messenger = ScaffoldMessenger.of(context);
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: extensions,
      withData: true,
    );
    final bytes = picked?.files.firstOrNull?.bytes;
    if (bytes == null) return;

    try {
      final importer = ref.read(portfolioImportProvider);
      final diff = await importer.preview(parser, bytes);
      if (diff.isNoOp) {
        messenger.showSnackBar(const SnackBar(
            content: Text('Already imported — no changes.')));
        return;
      }
      if (!context.mounted) return;
      final confirmed = await _showDiff(context, diff);
      if (confirmed == true) {
        await importer.apply(diff);
        messenger.showSnackBar(SnackBar(
            content: Text(
                'Imported: ${diff.added.length} new, ${diff.changed.length} updated.')));
      }
    } on Exception catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Import failed: $e')));
    }
  }

  Future<bool?> _showDiff(BuildContext context, PortfolioDiff diff) {
    return showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Review import'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${diff.added.length} new holdings'),
            Text('${diff.changed.length} updated'),
            Text('${diff.unchanged.length} unchanged'),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Import')),
        ],
      ),
    );
  }
}
