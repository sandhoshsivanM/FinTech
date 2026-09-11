import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/router/layout_providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/services/budget_calculator.dart';
import '../../../domain/services/calendar_aggregator.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
import '../../budget/providers/budget_providers.dart';
import '../../transactions/providers/category_providers.dart';
import '../providers/calendar_providers.dart';

/// Adaptive calendar ledger (PRD §10 adaptive layout):
/// • ≤600px — single column; tapping a day opens a bottom sheet.
/// • >600px — month-nav sidebar · calendar · day/budget tracker panel.
class CalendarLedgerScreen extends ConsumerStatefulWidget {
  const CalendarLedgerScreen({super.key});

  @override
  ConsumerState<CalendarLedgerScreen> createState() =>
      _CalendarLedgerScreenState();
}

class _CalendarLedgerScreenState extends ConsumerState<CalendarLedgerScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(
        () => ref.read(wideLayoutProvider.notifier).state = true);
  }

  @override
  void dispose() {
    ref.read(wideLayoutProvider.notifier).state = false;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('Calendar'),
      ),
      body: SafeArea(
        child: DataGate(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth > 600;
              return wide ? const _WideLayout() : const _CompactLayout();
            },
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

class _CompactLayout extends ConsumerWidget {
  const _CompactLayout();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.md),
      children: [
        const _MonthTotalsCard(),
        const SizedBox(height: AppSpacing.md),
        _CalendarCard(
          onTapDay: (day) {
            ref.read(selectedDayProvider.notifier).state = day;
            _showDaySheet(context, day);
          },
        ),
        const SizedBox(height: AppSpacing.md),
        const _BudgetTracker(),
      ],
    );
  }
}

class _WideLayout extends ConsumerWidget {
  const _WideLayout();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(selectedDayProvider);
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 250,
                child: Column(children: const [
                  _MonthTotalsCard(),
                ]),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: _CalendarCard(
                  onTapDay: (day) =>
                      ref.read(selectedDayProvider.notifier).state = day,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              SizedBox(
                width: 330,
                child: Column(
                  children: [
                    GlassCard(
                      child: selected == null
                          ? const _EmptyHint('Select a day to see its ledger.')
                          : _DayDetail(day: selected),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    const _BudgetTracker(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

void _showDaySheet(BuildContext context, DateTime day) {
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (context) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.7,
          ),
          child: SingleChildScrollView(child: _DayDetail(day: day)),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Month totals card (income / expense / net pills)
// ---------------------------------------------------------------------------

class _MonthTotalsCard extends ConsumerWidget {
  const _MonthTotalsCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cursor = ref.watch(monthCursorProvider);
    final ledgers = ref.watch(dayLedgersProvider);
    final prefix = DateFormat('yyyy-MM').format(cursor);
    var income = Decimal.zero;
    var expense = Decimal.zero;
    for (final entry in ledgers.entries) {
      if (!entry.key.startsWith(prefix)) continue;
      income += entry.value.income;
      expense += entry.value.expense;
    }
    final net = income - expense;

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(DateFormat('MMMM yyyy').format(cursor),
              style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: AppSpacing.md),
          _StatRow(
              icon: Icons.south_west,
              label: 'Income',
              value: income,
              color: context.colors.income),
          const SizedBox(height: AppSpacing.sm),
          _StatRow(
              icon: Icons.north_east,
              label: 'Spending',
              value: expense,
              color: context.colors.expense),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: Divider(height: 1),
          ),
          _StatRow(
            icon: net >= Decimal.zero
                ? Icons.trending_up
                : Icons.trending_down,
            label: 'Net',
            value: net,
            color: net >= Decimal.zero ? context.colors.income : context.colors.expense,
            emphasize: true,
          ),
        ],
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
    this.emphasize = false,
  });

  final IconData icon;
  final String label;
  final Decimal value;
  final Color color;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(9),
          ),
          child: Icon(icon, size: 16, color: color),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(child: Text(label)),
        Text(
          Money.format(value),
          style: TextStyle(
            color: color,
            fontWeight: emphasize ? FontWeight.w800 : FontWeight.w600,
            fontSize: emphasize ? 16 : 14,
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Calendar card (month nav + grid)
// ---------------------------------------------------------------------------

class _CalendarCard extends ConsumerWidget {
  const _CalendarCard({required this.onTapDay});
  final void Function(DateTime day) onTapDay;

  static const _weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cursor = ref.watch(monthCursorProvider);
    final ledgers = ref.watch(dayLedgersProvider);
    final selected = ref.watch(selectedDayProvider);
    final today = DateTime.now();
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    final firstOfMonth = DateTime(cursor.year, cursor.month, 1);
    final daysInMonth = DateTime(cursor.year, cursor.month + 1, 0).day;
    final leadingBlanks = firstOfMonth.weekday - 1; // Monday-first

    void shift(int months) => ref.read(monthCursorProvider.notifier).state =
        DateTime(cursor.year, cursor.month + months);

    final cells = <Widget>[
      for (final w in _weekdayLabels)
        Center(
          child: Text(w,
              style: TextStyle(
                  fontSize: 11.5,
                  color: muted,
                  fontWeight: FontWeight.w700)),
        ),
      for (var i = 0; i < leadingBlanks; i++) const SizedBox.shrink(),
      for (var d = 1; d <= daysInMonth; d++)
        _DayCell(
          date: DateTime(cursor.year, cursor.month, d),
          ledger: ledgers[CalendarAggregator.dayKey(
              DateTime(cursor.year, cursor.month, d))],
          isToday: today.year == cursor.year &&
              today.month == cursor.month &&
              today.day == d,
          isSelected: selected != null &&
              selected.year == cursor.year &&
              selected.month == cursor.month &&
              selected.day == d,
          onTap: onTapDay,
        ),
    ];

    return GlassCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        children: [
          Row(
            children: [
              _NavButton(
                  icon: Icons.chevron_left,
                  tooltip: 'Previous month',
                  onTap: () => shift(-1)),
              Expanded(
                child: Center(
                  child: Text(
                    DateFormat('MMMM yyyy').format(cursor),
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
              _NavButton(
                  icon: Icons.chevron_right,
                  tooltip: 'Next month',
                  onTap: () => shift(1)),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          GridView.count(
            crossAxisCount: 7,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 5,
            crossAxisSpacing: 5,
            children: cells,
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _LegendDot(color: context.colors.income, label: 'Income'),
              const SizedBox(width: AppSpacing.md),
              _LegendDot(color: context.colors.expense, label: 'Spending'),
            ],
          ),
        ],
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  const _NavButton(
      {required this.icon, required this.tooltip, required this.onTap});
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onTap,
      tooltip: tooltip,
      visualDensity: VisualDensity.compact,
      style: IconButton.styleFrom(
        backgroundColor: context.colors.accent.withValues(alpha: 0.10),
      ),
      icon: Icon(icon, color: context.colors.accent),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 5),
        Text(label,
            style: TextStyle(
                fontSize: 11,
                color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.date,
    required this.ledger,
    required this.isToday,
    required this.isSelected,
    required this.onTap,
  });

  final DateTime date;
  final DayLedger? ledger;
  final bool isToday;
  final bool isSelected;
  final void Function(DateTime day) onTap;

  @override
  Widget build(BuildContext context) {
    final hasIncome = ledger != null && ledger!.income > Decimal.zero;
    final hasExpense = ledger != null && ledger!.expense > Decimal.zero;
    final hasActivity = hasIncome || hasExpense;

    final Color bg;
    final Color border;
    if (isSelected) {
      bg = context.colors.accent.withValues(alpha: 0.16);
      border = context.colors.accent;
    } else if (isToday) {
      bg = context.colors.accent.withValues(alpha: 0.06);
      border = context.colors.accent.withValues(alpha: 0.45);
    } else if (hasActivity) {
      bg = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.035);
      border = AppColors.glassBorderLight;
    } else {
      bg = Colors.transparent;
      border = AppColors.glassBorderLight;
    }

    return InkWell(
      onTap: () => onTap(date),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: border, width: isSelected ? 1.6 : 1),
          color: bg,
        ),
        padding: const EdgeInsets.all(5),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('${date.day}',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight:
                          isToday ? FontWeight.w800 : FontWeight.w500,
                      color: isToday || isSelected
                          ? context.colors.accent
                          : null,
                    )),
                const Spacer(),
                if (ledger?.hasAttachment ?? false)
                  Icon(Icons.attach_file,
                      size: 11,
                      color: Theme.of(context).colorScheme.onSurfaceVariant),
              ],
            ),
            const Spacer(),
            Row(
              children: [
                if (hasIncome) _dot(context.colors.income),
                if (hasExpense) _dot(context.colors.expense),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _dot(Color c) => Container(
        width: 6,
        height: 6,
        margin: const EdgeInsets.only(right: 3),
        decoration: BoxDecoration(color: c, shape: BoxShape.circle),
      );
}

// ---------------------------------------------------------------------------
// Day detail
// ---------------------------------------------------------------------------

class _DayDetail extends ConsumerWidget {
  const _DayDetail({required this.day});
  final DateTime day;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final txns = ref.watch(dayTransactionsProvider(day));
    final categories =
        ref.watch(categoryListProvider).valueOrNull ?? const [];
    final byId = {for (final c in categories) c.id: c.name};

    var income = Decimal.zero;
    var expense = Decimal.zero;
    for (final t in txns) {
      if (t.type == TxnType.income) {
        income += t.amount;
      } else {
        expense += t.amount;
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(DateFormat('EEEE, d MMM').format(day),
            style:
                const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        if (txns.isNotEmpty) ...[
          const SizedBox(height: 2),
          Text(
            '${Money.formatSigned(income, isIncome: true)}  ·  '
            '${Money.formatSigned(expense, isIncome: false)}',
            style: TextStyle(
                fontSize: 12,
                color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ],
        const SizedBox(height: AppSpacing.sm),
        if (txns.isEmpty)
          const _EmptyHint('No transactions on this day.')
        else
          for (final t in txns)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: (t.type == TxnType.income
                              ? context.colors.income
                              : context.colors.expense)
                          .withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      t.attachmentRef != null
                          ? Icons.receipt_long
                          : (t.type == TxnType.income
                              ? Icons.south_west
                              : Icons.north_east),
                      size: 17,
                      color: t.type == TxnType.income
                          ? context.colors.income
                          : context.colors.expense,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t.merchant ?? byId[t.categoryId] ?? 'Transaction',
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                        Text(byId[t.categoryId] ?? '',
                            style: TextStyle(
                                fontSize: 11.5,
                                color: Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant)),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Text(
                    Money.formatSigned(t.amount,
                        isIncome: t.type == TxnType.income),
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: t.type == TxnType.income
                          ? context.colors.income
                          : context.colors.expense,
                    ),
                  ),
                ],
              ),
            ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Budget indicators (neutral → amber → soft red on overspend)
// ---------------------------------------------------------------------------

class _BudgetTracker extends ConsumerWidget {
  const _BudgetTracker();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final progress = ref.watch(budgetProgressProvider);
    final categories =
        ref.watch(categoryListProvider).valueOrNull ?? const [];
    final byId = {for (final c in categories) c.id: c.name};
    if (progress.isEmpty) return const SizedBox.shrink();
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.pie_chart_outline,
                  size: 18, color: context.colors.accent),
              const SizedBox(width: AppSpacing.sm),
              const Text('Budgets', style: TextStyle(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          for (final p in progress) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(byId[p.budget.categoryId] ?? 'Category'),
                Text(
                  '${Money.format(p.spent)} / ${Money.format(p.budget.amountLimit)}',
                  style: TextStyle(fontSize: 11.5, color: muted),
                ),
              ],
            ),
            const SizedBox(height: 5),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: p.fraction,
                minHeight: 7,
                backgroundColor: AppColors.glassFillLight,
                color: _budgetColor(context.colors, p.status),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        ],
      ),
    );
  }
}

Color _budgetColor(SemanticColors c, BudgetStatus status) => switch (status) {
      BudgetStatus.ok => c.budgetOk,
      BudgetStatus.warning => c.budgetWarn,
      BudgetStatus.over => c.budgetOver,
    };

class _EmptyHint extends StatelessWidget {
  const _EmptyHint(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Text(text,
          style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant)),
    );
  }
}
