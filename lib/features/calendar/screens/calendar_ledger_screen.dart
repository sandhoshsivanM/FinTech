import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/router/layout_providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/services/budget_calculator.dart';
import '../../../domain/services/calendar_aggregator.dart';
import '../../../presentation/data_gate.dart';
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
    // Allow the desktop multi-panel layout to use the full width.
    Future.microtask(
        () => ref.read(wideLayoutProvider.notifier).state = true);
  }

  @override
  void dispose() {
    // Restore the mobile-first cap when leaving the calendar.
    ref.read(wideLayoutProvider.notifier).state = false;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Calendar')),
      body: DataGate(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth > 600;
            return wide ? const _WideLayout() : const _CompactLayout();
          },
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
        const _MonthHeader(),
        const SizedBox(height: AppSpacing.sm),
        _CalendarGrid(
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
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Left: month navigation + month summary.
        SizedBox(
          width: 240,
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: const [_MonthHeader(vertical: true), _MonthSummary()],
          ),
        ),
        const VerticalDivider(width: 1),
        // Center: the calendar workspace.
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              _CalendarGrid(
                onTapDay: (day) =>
                    ref.read(selectedDayProvider.notifier).state = day,
              ),
            ],
          ),
        ),
        const VerticalDivider(width: 1),
        // Right: day tracker + budget indicators.
        SizedBox(
          width: 320,
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              if (selected != null)
                _DayDetail(day: selected)
              else
                const Padding(
                  padding: EdgeInsets.all(AppSpacing.md),
                  child: Text('Select a day to see its ledger.'),
                ),
              const SizedBox(height: AppSpacing.md),
              const _BudgetTracker(),
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
        padding: const EdgeInsets.all(AppSpacing.md),
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
// Month header + summary
// ---------------------------------------------------------------------------

class _MonthHeader extends ConsumerWidget {
  const _MonthHeader({this.vertical = false});
  final bool vertical;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cursor = ref.watch(monthCursorProvider);
    final label = DateFormat('MMMM yyyy').format(cursor);
    void shift(int months) => ref.read(monthCursorProvider.notifier).state =
        DateTime(cursor.year, cursor.month + months);

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        IconButton(
          onPressed: () => shift(-1),
          icon: const Icon(Icons.chevron_left),
          tooltip: 'Previous month',
        ),
        Text(label,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        IconButton(
          onPressed: () => shift(1),
          icon: const Icon(Icons.chevron_right),
          tooltip: 'Next month',
        ),
      ],
    );
  }
}

class _MonthSummary extends ConsumerWidget {
  const _MonthSummary();

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
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('This month',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: AppSpacing.sm),
            _kv('Income', income, AppColors.income),
            _kv('Expense', expense, AppColors.expense),
            const Divider(),
            _kv('Net', net,
                net >= Decimal.zero ? AppColors.income : AppColors.expense),
          ],
        ),
      ),
    );
  }

  Widget _kv(String k, Decimal v, Color color) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(k),
            Text(Money.format(v),
                style: TextStyle(color: color, fontWeight: FontWeight.w600)),
          ],
        ),
      );
}

// ---------------------------------------------------------------------------
// Calendar grid
// ---------------------------------------------------------------------------

class _CalendarGrid extends ConsumerWidget {
  const _CalendarGrid({required this.onTapDay});
  final void Function(DateTime day) onTapDay;

  static const _weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cursor = ref.watch(monthCursorProvider);
    final ledgers = ref.watch(dayLedgersProvider);
    final selected = ref.watch(selectedDayProvider);
    final today = DateTime.now();

    final firstOfMonth = DateTime(cursor.year, cursor.month, 1);
    final daysInMonth = DateTime(cursor.year, cursor.month + 1, 0).day;
    final leadingBlanks = firstOfMonth.weekday - 1; // Monday-first

    final cells = <Widget>[
      for (final w in _weekdayLabels)
        Center(
          child: Text(w,
              style: TextStyle(
                  fontSize: 12,
                  color: AppColors.darkOnSurfaceMuted,
                  fontWeight: FontWeight.w600)),
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

    return GridView.count(
      crossAxisCount: 7,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 4,
      crossAxisSpacing: 4,
      children: cells,
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
    return InkWell(
      onTap: () => onTap(date),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected
                ? AppColors.accent
                : (isToday
                    ? AppColors.accent.withValues(alpha: 0.4)
                    : AppColors.glassBorderLight),
            width: isSelected ? 2 : 1,
          ),
          color: isToday ? AppColors.accent.withValues(alpha: 0.06) : null,
        ),
        padding: const EdgeInsets.all(4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('${date.day}', style: const TextStyle(fontSize: 12)),
                const Spacer(),
                if (ledger?.hasAttachment ?? false)
                  Icon(Icons.attach_file,
                      size: 11, color: AppColors.darkOnSurfaceMuted),
              ],
            ),
            const Spacer(),
            Row(
              children: [
                if (hasIncome) _dot(AppColors.income),
                if (hasExpense) _dot(AppColors.expense),
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
// Day detail (bottom sheet on mobile / right panel on desktop)
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
    final df = DateFormat('EEEE, d MMM yyyy');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(df.format(day),
            style:
                const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        const SizedBox(height: AppSpacing.sm),
        if (txns.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
            child: Text('No transactions on this day.'),
          )
        else
          for (final t in txns)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                t.attachmentRef != null
                    ? Icons.receipt_long
                    : (t.type == TxnType.income
                        ? Icons.south_west
                        : Icons.north_east),
                color: t.type == TxnType.income
                    ? AppColors.income
                    : AppColors.expense,
              ),
              title: Text(t.merchant ?? byId[t.categoryId] ?? 'Transaction'),
              subtitle: Text(byId[t.categoryId] ?? ''),
              trailing: Text(
                Money.formatSigned(t.amount,
                    isIncome: t.type == TxnType.income),
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: t.type == TxnType.income
                      ? AppColors.income
                      : AppColors.expense,
                ),
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

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Budgets',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: AppSpacing.sm),
            for (final p in progress) ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(byId[p.budget.categoryId] ?? 'Category'),
                  Text(
                    '${Money.format(p.spent)} / ${Money.format(p.budget.amountLimit)}',
                    style: TextStyle(
                        fontSize: 12, color: AppColors.darkOnSurfaceMuted),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: p.fraction,
                  minHeight: 7,
                  backgroundColor: AppColors.glassFillLight,
                  color: _budgetColor(p.status),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
          ],
        ),
      ),
    );
  }
}

Color _budgetColor(BudgetStatus status) => switch (status) {
      BudgetStatus.ok => AppColors.budgetOk,
      BudgetStatus.warning => AppColors.budgetWarn,
      BudgetStatus.over => AppColors.budgetOver,
    };
