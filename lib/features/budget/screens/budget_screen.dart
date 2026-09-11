import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../domain/entities/category.dart';
import '../../../presentation/data_gate.dart';
import '../../transactions/providers/category_providers.dart';
import '../providers/budget_providers.dart';
import '../widgets/budget_tile.dart';

class BudgetScreen extends StatelessWidget {
  const BudgetScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: const DataGate(child: _BudgetBody()),
    );
  }
}

class _BudgetBody extends ConsumerWidget {
  const _BudgetBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final progress = ref.watch(budgetProgressProvider);
    final categories = ref.watch(categoryListProvider).valueOrNull ?? const [];
    final byId = {for (final c in categories) c.id: c};

    return Column(
      children: [
        Expanded(
          child: progress.isEmpty
              ? const _EmptyBudgets()
              : ListView(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  children: [
                    for (final p in progress)
                      BudgetTile(
                        progress: p,
                        categoryName: byId[p.budget.categoryId]?.name ??
                            'Category',
                        onDelete: () => ref
                            .read(budgetActionsProvider)
                            .delete(p.budget.id),
                      ),
                  ],
                ),
        ),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _show503020(context, ref),
                  icon: const Icon(Icons.auto_awesome),
                  label: const Text('50/30/20'),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: FilledButton.icon(
                  onPressed: categories.isEmpty
                      ? null
                      : () => _showAdd(context, ref, categories),
                  icon: const Icon(Icons.add),
                  label: const Text('Add budget'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _showAdd(
      BuildContext context, WidgetRef ref, List<Category> categories) async {
    final amount = TextEditingController();
    String? categoryId = categories.first.id;
    var rollover = false;
    int threshold = 90;

    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('New monthly budget'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: categoryId,
                decoration: const InputDecoration(labelText: 'Category'),
                items: [
                  for (final c in categories)
                    DropdownMenuItem(value: c.id, child: Text(c.name)),
                ],
                onChanged: (v) => setState(() => categoryId = v),
              ),
              TextField(
                controller: amount,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                    labelText: 'Monthly limit (₹)', prefixText: '₹ '),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Roll over unused'),
                value: rollover,
                onChanged: (v) => setState(() => rollover = v),
              ),
              DropdownButtonFormField<int>(
                initialValue: threshold,
                decoration: const InputDecoration(labelText: 'Alert at'),
                items: const [
                  DropdownMenuItem(value: 70, child: Text('70%')),
                  DropdownMenuItem(value: 80, child: Text('80%')),
                  DropdownMenuItem(value: 90, child: Text('90%')),
                  DropdownMenuItem(value: 100, child: Text('100%')),
                ],
                onChanged: (v) => setState(() => threshold = v ?? 90),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                final limit = Decimal.tryParse(amount.text.trim());
                if (limit == null || limit <= Decimal.zero || categoryId == null) {
                  return;
                }
                ref.read(budgetActionsProvider).add(
                      categoryId: categoryId!,
                      limit: limit,
                      rollover: rollover,
                      alertThresholdPct: threshold,
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

  Future<void> _show503020(BuildContext context, WidgetRef ref) async {
    final income = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('50/30/20 quick start'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
                'Splits your monthly income into Needs 50%, Wants 30%, Savings 20%.'),
            const SizedBox(height: AppSpacing.sm),
            TextField(
              controller: income,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                  labelText: 'Monthly income (₹)', prefixText: '₹ '),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              final amt = Decimal.tryParse(income.text.trim());
              if (amt == null || amt <= Decimal.zero) return;
              final calc = ref.read(budgetCalculatorProvider);
              final split = calc.fiftyThirtyTwenty(amt);
              final cats =
                  ref.read(categoryListProvider).valueOrNull ?? const [];
              // Map the split onto representative seed categories.
              final actions = ref.read(budgetActionsProvider);
              String? idFor(String name) =>
                  cats.where((c) => c.name == name).firstOrNull?.id;
              final needs = idFor('Rent') ?? idFor('Food');
              final wants = idFor('Entertainment') ?? idFor('Shopping');
              final savings = idFor('Investment');
              if (needs != null) {
                actions.add(categoryId: needs, limit: split.needs);
              }
              if (wants != null) {
                actions.add(categoryId: wants, limit: split.wants);
              }
              if (savings != null) {
                actions.add(categoryId: savings, limit: split.savings);
              }
              Navigator.pop(context);
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }
}

class _EmptyBudgets extends StatelessWidget {
  const _EmptyBudgets();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.pie_chart_outline, size: 64),
          const SizedBox(height: AppSpacing.md),
          Text('No budgets yet',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.xs),
          const Text('Add one or use the 50/30/20 quick start.'),
        ],
      ),
    );
  }
}
