import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/recurring_rule.dart';
import '../../../domain/entities/transaction.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/empty_state.dart';
import '../../../presentation/glass_card.dart';
import '../providers/category_providers.dart';
import '../providers/recurring_providers.dart';

class RecurringScreen extends StatelessWidget {
  const RecurringScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Recurring transactions')),
      body: const DataGate(child: _Body()),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rules = ref.watch(recurringListProvider).valueOrNull ?? const [];
    final cats = ref.watch(categoryListProvider).valueOrNull ?? const [];
    final byId = {for (final c in cats) c.id: c.name};

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: rules.isEmpty
          ? EmptyState(
              icon: Icons.repeat_rounded,
              title: 'No recurring rules yet',
              message: 'Rent, EMIs, subscriptions — anything that repeats on a '
                  'schedule. Khazana posts each one automatically on its due '
                  'date so your cash flow stays complete.',
              action: FilledButton.icon(
                onPressed: cats.isEmpty ? null : () => _add(context, ref),
                icon: const Icon(Icons.add),
                label: const Text('Add your first rule'),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(
                  AppSpacing.md, 0, AppSpacing.md, 96),
              children: [
                _MonthlyTotals(rules: rules),
                const SizedBox(height: AppSpacing.md),
                for (final r in rules) ...[
                  _RuleCard(
                    rule: r,
                    category: byId[r.categoryId] ?? 'Uncategorised',
                    onDelete: () =>
                        ref.read(recurringActionsProvider).delete(r.id),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                ],
              ],
            ),
      floatingActionButton: rules.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: cats.isEmpty ? null : () => _add(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('Add rule'),
            ),
    );
  }

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final amount = TextEditingController();
    final cats = ref.read(categoryListProvider).valueOrNull ?? const [];
    String? categoryId = cats.first.id;
    var type = TxnType.expense;
    var freq = Frequency.monthly;

    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('New recurring rule'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: amount,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'Amount (₹)', prefixText: '₹ '),
              ),
              DropdownButtonFormField<String>(
                initialValue: categoryId,
                decoration: const InputDecoration(labelText: 'Category'),
                items: [
                  for (final c in cats)
                    DropdownMenuItem(value: c.id, child: Text(c.name)),
                ],
                onChanged: (v) => setState(() => categoryId = v),
              ),
              DropdownButtonFormField<Frequency>(
                initialValue: freq,
                decoration: const InputDecoration(labelText: 'Frequency'),
                items: [
                  for (final f in Frequency.values)
                    DropdownMenuItem(value: f, child: Text(f.key)),
                ],
                onChanged: (v) => setState(() => freq = v ?? freq),
              ),
              SegmentedButton<TxnType>(
                segments: const [
                  ButtonSegment(value: TxnType.expense, label: Text('Expense')),
                  ButtonSegment(value: TxnType.income, label: Text('Income')),
                ],
                selected: {type},
                onSelectionChanged: (s) => setState(() => type = s.first),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                final a = Decimal.tryParse(amount.text.trim());
                if (a == null || a <= Decimal.zero || categoryId == null) return;
                ref.read(recurringActionsProvider).add(
                      amount: a,
                      type: type,
                      categoryId: categoryId!,
                      frequency: freq,
                      firstRun: DateTime.now(),
                    );
                Navigator.pop(context);
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}

/// What the schedule costs per month, at a glance.
///
/// A list of rules at mixed frequencies — a daily coffee, a weekly cleaner, a
/// yearly premium — does not add up to anything the eye can compute. Converting
/// each to its monthly equivalent is the number people actually want.
class _MonthlyTotals extends StatelessWidget {
  const _MonthlyTotals({required this.rules});

  final List<RecurringRule> rules;

  /// Monthly equivalent of one rule.
  ///
  /// Weekly uses 52/12, not 4 — four weeks a month undercounts by ~8%, which on
  /// a large standing order is a visible error rather than a rounding one.
  static Decimal _perMonth(RecurringRule r) => switch (r.frequency) {
        Frequency.daily => r.amount * Decimal.fromInt(30),
        Frequency.weekly => (r.amount * Decimal.fromInt(52) / Decimal.fromInt(12))
            .toDecimal(scaleOnInfinitePrecision: 2),
        Frequency.monthly => r.amount,
        Frequency.yearly => (r.amount / Decimal.fromInt(12))
            .toDecimal(scaleOnInfinitePrecision: 2),
      };

  @override
  Widget build(BuildContext context) {
    var out = Decimal.zero;
    var inn = Decimal.zero;
    for (final r in rules) {
      if (r.type == TxnType.income) {
        inn += _perMonth(r);
      } else {
        out += _perMonth(r);
      }
    }
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    Widget cell(String label, Decimal value, Color color) => Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: text.labelMedium?.copyWith(color: muted)),
              const SizedBox(height: 2),
              Text(
                Money.format(value),
                style: text.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800, color: color),
              ),
            ],
          ),
        );

    return GlassCard(
      child: Row(
        children: [
          cell('Committed each month', out, context.colors.expense),
          if (inn > Decimal.zero) cell('Expected in', inn, context.colors.income),
          Expanded(
            child: Text(
              '${rules.length} rule${rules.length == 1 ? '' : 's'}',
              textAlign: TextAlign.right,
              style: text.bodyMedium?.copyWith(color: muted),
            ),
          ),
        ],
      ),
    );
  }
}

class _RuleCard extends StatelessWidget {
  const _RuleCard({
    required this.rule,
    required this.category,
    required this.onDelete,
  });

  final RecurringRule rule;
  final String category;
  final VoidCallback onDelete;

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  /// "4 Aug 2026" rather than "2026-08-04". An ISO date is for a log file; a
  /// person reading their own bills wants the month by name.
  static String _date(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final income = rule.type == TxnType.income;
    final tint = income ? context.colors.income : context.colors.expense;

    final days = rule.nextRun.difference(DateTime.now()).inDays;
    final due = days < 0
        ? 'overdue'
        : days == 0
            ? 'due today'
            : days == 1
                ? 'due tomorrow'
                : 'in $days days';

    return GlassCard(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md, vertical: AppSpacing.md),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: tint.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(income ? Icons.sync_alt : Icons.repeat_rounded,
                size: 20, color: tint),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(category,
                    style: text.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  '${rule.frequency.key} · next ${_date(rule.nextRun)} · $due',
                  style: text.bodySmall?.copyWith(color: muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Text(
            '${income ? '+' : '−'}${Money.format(rule.amount)}',
            style: text.titleSmall
                ?.copyWith(fontWeight: FontWeight.w800, color: tint),
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline, size: 20),
            tooltip: 'Delete rule',
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}
