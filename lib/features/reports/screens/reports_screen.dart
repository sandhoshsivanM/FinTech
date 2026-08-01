import 'dart:math' as math;

import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/services/net_worth_calculator.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/charts/area_chart.dart';
import '../../../presentation/charts/donut_chart.dart';
import '../../../presentation/glass_card.dart';
import '../../transactions/providers/category_providers.dart';
import '../../transactions/providers/transaction_providers.dart';
import '../providers/dashboard_providers.dart';

// ---------------------------------------------------------------------------
// Screen root
// ---------------------------------------------------------------------------

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('Reports'),
      ),
      body: const SafeArea(child: DataGate(child: _ReportsBody())),
    );
  }
}

// ---------------------------------------------------------------------------
// Body — guards then scrollable layout
// ---------------------------------------------------------------------------

class _ReportsBody extends ConsumerWidget {
  const _ReportsBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final txnState = ref.watch(transactionListProvider);
    if (txnState is TransactionLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (txnState is TransactionError) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppColors.expense),
              const SizedBox(height: AppSpacing.sm),
              Text('Could not load data: ${txnState.message}',
                  textAlign: TextAlign.center),
            ],
          ),
        ),
      );
    }

    final data = ref.watch(netWorthProvider);
    final window = ref.watch(selectedWindowProvider);

    if (data == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return ListView(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      children: [
        // Time-window filter.
        _WindowSelector(
          selected: window,
          onChanged: (w) =>
              ref.read(selectedWindowProvider.notifier).state = w,
        ),
        const SizedBox(height: AppSpacing.md),

        // 1. Income vs Expense bars.
        _IncomeExpenseCard(summary: data.summary),
        const SizedBox(height: AppSpacing.md),

        // 2. Spending by category donut.
        _SpendingByCategoryCard(window: window),
        const SizedBox(height: AppSpacing.md),

        // 3. Net worth sparkline.
        _NetWorthTrendCard(series: data.series),
        const SizedBox(height: AppSpacing.lg),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Window selector
// ---------------------------------------------------------------------------

class _WindowSelector extends StatelessWidget {
  const _WindowSelector({required this.selected, required this.onChanged});

  final TimeWindow selected;
  final ValueChanged<TimeWindow> onChanged;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<TimeWindow>(
      segments: [
        for (final w in TimeWindow.values)
          ButtonSegment(value: w, label: Text(w.label)),
      ],
      selected: {selected},
      onSelectionChanged: (s) => onChanged(s.first),
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Income vs Expense card
// ---------------------------------------------------------------------------

class _IncomeExpenseCard extends StatelessWidget {
  const _IncomeExpenseCard({required this.summary});

  final WindowSummary summary;

  @override
  Widget build(BuildContext context) {
    final income = summary.income;
    final expense = summary.expense;
    final larger = income > expense ? income : expense;

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Income vs Expense',
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppSpacing.md),
          _BarRow(
            label: 'Income',
            amount: income,
            larger: larger,
            color: AppColors.income,
            icon: Icons.arrow_downward_rounded,
          ),
          const SizedBox(height: AppSpacing.sm),
          _BarRow(
            label: 'Expense',
            amount: expense,
            larger: larger,
            color: AppColors.expense,
            icon: Icons.arrow_upward_rounded,
          ),
        ],
      ),
    );
  }
}

class _BarRow extends StatelessWidget {
  const _BarRow({
    required this.label,
    required this.amount,
    required this.larger,
    required this.color,
    required this.icon,
  });

  final String label;
  final Decimal amount;
  final Decimal larger;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final fraction = larger == Decimal.zero
        ? 0.0
        : (amount.toDouble() / larger.toDouble()).clamp(0.0, 1.0);

    return Semantics(
      label: '$label ${Money.toWords(amount)}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 14),
              const SizedBox(width: AppSpacing.xs),
              Text(
                label,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontWeight: FontWeight.w600,
                    ),
              ),
              const Spacer(),
              ExcludeSemantics(
                child: Text(
                  Money.format(amount),
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ExcludeSemantics(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.pill),
              child: Stack(
                children: [
                  Container(
                    height: 8,
                    width: double.infinity,
                    color: color.withValues(alpha: 0.12),
                  ),
                  FractionallySizedBox(
                    widthFactor: fraction,
                    child: Container(
                      height: 8,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius:
                            BorderRadius.circular(AppRadii.pill),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Spending by category donut
// ---------------------------------------------------------------------------

const _kCategoryPalette = [
  AppColors.accent,
  AppColors.budgetWarn,
  Color(0xFF8B5CF6),
  AppColors.income,
  AppColors.expense,
  Color(0xFF64748B),
];

class _SpendingByCategoryCard extends ConsumerWidget {
  const _SpendingByCategoryCard({required this.window});

  final TimeWindow window;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final txnState = ref.watch(transactionListProvider);
    final categoriesAsync = ref.watch(categoryListProvider);

    final txns =
        txnState is TransactionData ? txnState.transactions : <Txn>[];
    final categories = categoriesAsync.valueOrNull ?? const [];
    final catMap = {for (final c in categories) c.id: c.name};

    // Filter to window expenses.
    final now = DateTime.now();
    final windowStart = now.subtract(window.duration);
    final expenses = txns.where((t) =>
        t.type == TxnType.expense &&
        !t.date.isBefore(windowStart) &&
        !t.date.isAfter(now));

    // Group by category.
    final grouped = <String, Decimal>{};
    for (final t in expenses) {
      grouped[t.categoryId] =
          (grouped[t.categoryId] ?? Decimal.zero) + t.amount;
    }

    if (grouped.isEmpty) {
      return GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Spending by Category',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: AppSpacing.md),
            SizedBox(
              height: 120,
              child: Center(
                child: Text(
                  'No expenses in this period.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ),
            ),
          ],
        ),
      );
    }

    // Sort desc, top 5 + others bucket.
    final sorted = grouped.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    const topN = 5;
    final top = sorted.take(topN).toList();
    final rest = sorted.skip(topN).toList();
    final otherSum = rest.fold(
        Decimal.zero, (s, e) => s + e.value);

    final segments = <DonutSegment>[
      for (var i = 0; i < top.length; i++)
        DonutSegment(
          catMap[top[i].key] ?? 'Other',
          top[i].value.toDouble(),
          _kCategoryPalette[i % _kCategoryPalette.length],
        ),
      if (otherSum > Decimal.zero)
        DonutSegment(
          'Others',
          otherSum.toDouble(),
          _kCategoryPalette[top.length % _kCategoryPalette.length],
        ),
    ];

    final total =
        segments.fold<double>(0, (s, seg) => s + seg.value);
    final largestPct = total <= 0
        ? '0%'
        : '${(segments.first.value / total * 100).round()}%';

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Spending by Category',
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppSpacing.md),
          Semantics(
            label:
                'Spending donut chart. Top category: ${segments.first.label} at $largestPct',
            child: ExcludeSemantics(
              child: DonutChart(
                segments: segments,
                size: 140,
                strokeWidth: 22,
                centerText: largestPct,
                centerSub: segments.first.label,
                showLegend: true,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Net worth over time sparkline
// ---------------------------------------------------------------------------

class _NetWorthTrendCard extends StatelessWidget {
  const _NetWorthTrendCard({required this.series});

  final List<NetWorthPoint> series;

  @override
  Widget build(BuildContext context) {
    final values = series.map((p) => p.value.toDouble()).toList();
    final allFlat = values.length < 2 ||
        (values.reduce(math.min) == values.reduce(math.max));

    if (allFlat) {
      return GlassCard(
        child: SizedBox(
          height: 160,
          width: double.infinity,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.show_chart,
                  size: 36, color: Theme.of(context).colorScheme.outline),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Net worth trend will appear here',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color:
                        Theme.of(context).colorScheme.onSurfaceVariant),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.xs),
              const Text(
                'Add a few transactions to get started',
                style: TextStyle(fontSize: 12, color: Colors.grey),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    // Downsample to ≤60 points.
    final step = (values.length / 60).ceil().clamp(1, values.length);
    final pts = <double>[
      for (var i = 0; i < values.length; i += step) values[i],
    ];
    if (pts.last != values.last) pts.add(values.last);

    final lastValue = series.last.value;

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Net Worth Over Time',
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              Text(
                Money.format(lastValue),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: AppColors.accent,
                    ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          AreaChart(
            values: pts,
            height: 140,
            semanticLabel: 'Net worth trend over the selected period, '
                'ending at ${Money.toWords(lastValue)}',
          ),
        ],
      ),
    );
  }
}

