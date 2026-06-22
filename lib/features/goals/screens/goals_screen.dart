import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/goal.dart';
import '../../../domain/services/goal_projector.dart';
import '../../../presentation/data_gate.dart';
import '../providers/goal_providers.dart';

class GoalsScreen extends StatelessWidget {
  const GoalsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Goals')),
      body: const DataGate(child: _Body()),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final goals = ref.watch(goalListProvider).valueOrNull ?? const [];
    return Scaffold(
      body: goals.isEmpty
          ? const Center(child: Text('No goals yet. Add one to start saving.'))
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [for (final g in goals) _GoalCard(goal: g)],
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addGoal(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('New goal'),
      ),
    );
  }

  Future<void> _addGoal(BuildContext context, WidgetRef ref) async {
    final name = TextEditingController();
    final target = TextEditingController();
    var type = GoalType.custom;
    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('New goal'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<GoalType>(
                initialValue: type,
                decoration: const InputDecoration(labelText: 'Type'),
                items: [
                  for (final t in GoalType.values)
                    DropdownMenuItem(value: t, child: Text(t.label)),
                ],
                onChanged: (v) => setState(() => type = v ?? type),
              ),
              TextField(
                  controller: name,
                  decoration: const InputDecoration(labelText: 'Name')),
              TextField(
                controller: target,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'Target amount (₹)', prefixText: '₹ '),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                final t = Decimal.tryParse(target.text.trim());
                final n = name.text.trim().isEmpty ? type.label : name.text.trim();
                if (t == null || t <= Decimal.zero) return;
                ref.read(goalActionsProvider).add(name: n, type: type, target: t);
                Navigator.pop(context);
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
  }
}

class _GoalCard extends ConsumerWidget {
  const _GoalCard({required this.goal});
  final Goal goal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final contributions =
        ref.watch(goalContributionsProvider(goal.id)).valueOrNull ?? const [];
    final progress =
        const GoalProjector().evaluate(goal, contributions);
    final pct = (progress.fraction * 100).round();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(goal.name,
                      style: Theme.of(context).textTheme.titleMedium),
                ),
                if (progress.isAchieved)
                  const Chip(
                    avatar: Icon(Icons.celebration, size: 16),
                    label: Text('Achieved'),
                  )
                else
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline),
                    tooltip: 'Add contribution',
                    onPressed: () => _contribute(context, ref),
                  ),
                IconButton(
                  icon: const Icon(Icons.delete_outline),
                  tooltip: 'Delete goal',
                  onPressed: () => ref.read(goalActionsProvider).delete(goal.id),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Semantics(
              label: '${goal.name}, $pct percent funded, '
                  '${Money.toWords(goal.currentAmount)} of ${Money.toWords(goal.targetAmount)}'
                  '${progress.onTrack ? '' : ', ${progress.monthsBehind} months behind pace'}',
              child: ExcludeSemantics(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    LinearProgressIndicator(
                      value: progress.fraction,
                      minHeight: 10,
                      color: progress.onTrack
                          ? AppColors.income
                          : AppColors.budgetWarn,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                        '${Money.format(goal.currentAmount)} of ${Money.format(goal.targetAmount)} · $pct%'),
                    if (progress.projectedCompletion != null)
                      Text(
                        progress.onTrack
                            ? 'On track · est. ${DateFormat('MMM yyyy').format(progress.projectedCompletion!)}'
                            : '${progress.monthsBehind} months behind pace',
                        style: TextStyle(
                          color: progress.onTrack
                              ? AppColors.income
                              : AppColors.budgetWarn,
                          fontSize: 12,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _contribute(BuildContext context, WidgetRef ref) async {
    final amount = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Contribute to ${goal.name}'),
        content: TextField(
          controller: amount,
          keyboardType: TextInputType.number,
          decoration:
              const InputDecoration(labelText: 'Amount (₹)', prefixText: '₹ '),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              final a = Decimal.tryParse(amount.text.trim());
              if (a == null || a <= Decimal.zero) return;
              ref.read(goalActionsProvider).contribute(goal.id, a);
              Navigator.pop(context);
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }
}
