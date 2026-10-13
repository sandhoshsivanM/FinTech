import '../../../core/help/info_hint.dart';
import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/goal.dart';
import '../../../domain/services/goal_projector.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
import '../../../presentation/zentra_kit.dart';
import '../../home/widgets/depth.dart';
import '../providers/goal_providers.dart';

class GoalsScreen extends StatelessWidget {
  const GoalsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(body: const DataGate(child: _Body()));
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
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: InfoHint.titled(
                    Text(
                      'Goals',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    'goals.page',
                  ),
                ),
                for (final g in goals) _GoalCard(goal: g),
              ],
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
          title: InfoHint.titled(const Text('New goal'), 'goals.form'),
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
                decoration: const InputDecoration(labelText: 'Name'),
              ),
              TextField(
                controller: target,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Target amount (₹)',
                  prefixText: '₹ ',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final t = Decimal.tryParse(target.text.trim());
                final n = name.text.trim().isEmpty
                    ? type.label
                    : name.text.trim();
                if (t == null || t <= Decimal.zero) return;
                ref
                    .read(goalActionsProvider)
                    .add(name: n, type: type, target: t);
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
    final progress = const GoalProjector().evaluate(goal, contributions);
    final pct = (progress.fraction * 100).round();

    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                TypeChip(
                  progress.isAchieved ? 'Achieved' : goal.goalType.label,
                ),
                const Spacer(),
                if (!progress.isAchieved)
                  IconAction(
                    icon: Icons.add_circle_outline,
                    tooltip: 'Add contribution',
                    onPressed: () => _contribute(context, ref),
                  ),
                IconAction(
                  icon: Icons.delete_outline,
                  tooltip: 'Delete goal',
                  onPressed: () =>
                      ref.read(goalActionsProvider).delete(goal.id),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(goal.name, style: text.titleLarge),
            const SizedBox(height: AppSpacing.md),
            Semantics(
              label:
                  '${goal.name}, $pct percent funded, '
                  '${Money.toWords(goal.currentAmount)} of ${Money.toWords(goal.targetAmount)}'
                  '${progress.onTrack ? '' : ', ${progress.monthsBehind} months behind pace'}',
              child: ExcludeSemantics(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      Money.format(goal.currentAmount),
                      style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w300,
                        letterSpacing: -0.5,
                      ),
                    ),
                    Text(
                      'of ${Money.format(goal.targetAmount)}',
                      style: text.bodySmall?.copyWith(color: muted),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Gauge(
                      fraction: progress.fraction,
                      hue: progress.onTrack ? Hue.blue : Hue.amber,
                    ),
                    if (progress.projectedCompletion != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        progress.onTrack
                            ? 'On track · est. ${DateFormat('MMM yyyy').format(progress.projectedCompletion!)}'
                            : '${progress.monthsBehind} months behind pace',
                        style: text.bodySmall?.copyWith(
                          color: progress.onTrack
                              ? context.colors.income
                              : context.colors.budgetWarn,
                        ),
                      ),
                    ],
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
          decoration: const InputDecoration(
            labelText: 'Amount (₹)',
            prefixText: '₹ ',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
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
