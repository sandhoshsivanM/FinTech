import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/insurance.dart';
import '../../../domain/services/insurance_advisor.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/empty_state.dart';
import '../providers/insurance_providers.dart';

IconData _typeIcon(InsuranceType t) => switch (t) {
      InsuranceType.life || InsuranceType.term => Icons.shield_outlined,
      InsuranceType.health => Icons.local_hospital_outlined,
      InsuranceType.vehicle => Icons.directions_car_outlined,
      InsuranceType.home => Icons.home_outlined,
      InsuranceType.other => Icons.policy_outlined,
    };

String _typeLabel(InsuranceType t) => switch (t) {
      InsuranceType.life => 'Life',
      InsuranceType.term => 'Term',
      InsuranceType.health => 'Health',
      InsuranceType.vehicle => 'Vehicle',
      InsuranceType.home => 'Home',
      InsuranceType.other => 'Other',
    };

class InsuranceScreen extends StatelessWidget {
  const InsuranceScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Insurance')),
      body: const DataGate(child: _Body()),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final policies = ref.watch(insuranceListProvider).valueOrNull ?? const [];
    final gaps = ref.watch(coverageGapsProvider);
    final advisor = ref.watch(insuranceAdvisorProvider);
    final totalCover =
        policies.fold(Decimal.zero, (s, p) => s + p.coverAmount);
    final premium = advisor.annualPremiumTotal(policies);

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              // Summary
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Row(
                    children: [
                      _Metric('Total cover', Money.format(totalCover)),
                      _Metric('Annual premium', Money.format(premium)),
                      _Metric('Policies', '${policies.length}'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),

              // Coverage gap analysis
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Coverage gap analysis',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: AppSpacing.sm),
                      for (final g in gaps) _GapRow(gap: g),
                      const SizedBox(height: 4),
                      Text(
                        'Guideline: life cover ≈ ${InsuranceAdvisor.lifeCoverMultiple}× annual '
                        'income; health ≥ ₹5L. Not financial advice.',
                        style: Theme.of(context)
                            .textTheme
                            .labelSmall
                            ?.copyWith(
                                color: AppColors.darkOnSurfaceMuted),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),

              if (policies.isEmpty)
                const EmptyState(
                  icon: Icons.umbrella_outlined,
                  title: 'No policies tracked yet',
                  message: 'Add your life and health cover and the gap analysis '
                      'above becomes a real reading of where you stand, rather '
                      'than 0% against a guideline.',
                )
              else
                for (final p in policies)
                  Card(
                    child: ListTile(
                      leading: Icon(_typeIcon(p.type), color: context.colors.accent),
                      title: Text(p.name),
                      subtitle: Text([
                        _typeLabel(p.type),
                        if (p.provider != null && p.provider!.isNotEmpty)
                          p.provider!,
                        'premium ${Money.format(p.premium)}/yr',
                      ].join(' · ')),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(Money.format(p.coverAmount),
                              style: const TextStyle(
                                  fontWeight: FontWeight.bold)),
                          IconButton(
                            icon: const Icon(Icons.delete_outline),
                            tooltip: 'Delete',
                            onPressed: () => ref
                                .read(insuranceActionsProvider)
                                .delete(p.id),
                          ),
                        ],
                      ),
                    ),
                  ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () => _add(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('Add policy'),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final name = TextEditingController();
    final provider = TextEditingController();
    final cover = TextEditingController();
    final premium = TextEditingController();
    var type = InsuranceType.life;

    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Add policy'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: name,
                    decoration: const InputDecoration(labelText: 'Name')),
                const SizedBox(height: AppSpacing.sm),
                DropdownButtonFormField<InsuranceType>(
                  initialValue: type,
                  decoration: const InputDecoration(labelText: 'Type'),
                  items: [
                    for (final t in InsuranceType.values)
                      DropdownMenuItem(value: t, child: Text(_typeLabel(t))),
                  ],
                  onChanged: (v) => setState(() => type = v ?? type),
                ),
                TextField(
                    controller: provider,
                    decoration:
                        const InputDecoration(labelText: 'Provider (optional)')),
                TextField(
                    controller: cover,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Cover amount (₹)', prefixText: '₹ ')),
                TextField(
                    controller: premium,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Annual premium (₹)', prefixText: '₹ ')),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                final c = Decimal.tryParse(cover.text.trim());
                final pr = Decimal.tryParse(premium.text.trim());
                if (name.text.trim().isEmpty || c == null) return;
                ref.read(insuranceActionsProvider).save(
                      name: name.text.trim(),
                      type: type,
                      provider: provider.text.trim().isEmpty
                          ? null
                          : provider.text.trim(),
                      coverAmount: c,
                      premium: pr ?? Decimal.zero,
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

class _Metric extends StatelessWidget {
  const _Metric(this.label, this.value);
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: Theme.of(context)
                  .textTheme
                  .labelSmall
                  ?.copyWith(color: AppColors.darkOnSurfaceMuted)),
          const SizedBox(height: 2),
          Text(value,
              style: const TextStyle(
                  fontWeight: FontWeight.w700, fontSize: 16)),
        ],
      ),
    );
  }
}

class _GapRow extends StatelessWidget {
  const _GapRow({required this.gap});
  final CoverageGap gap;
  @override
  Widget build(BuildContext context) {
    final frac = (gap.coveredPct / 100).clamp(0.0, 1.0);
    final color = gap.coveredPct >= 100
        ? context.colors.income
        : gap.coveredPct >= 60
            ? context.colors.budgetWarn
            : context.colors.expense;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                  child: Text(gap.label,
                      style: const TextStyle(fontWeight: FontWeight.w600))),
              Text('${gap.coveredPct}%', style: TextStyle(color: color)),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.pill),
            child: LinearProgressIndicator(
              value: frac,
              minHeight: 6,
              valueColor: AlwaysStoppedAnimation(color),
              backgroundColor: color.withValues(alpha: 0.15),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            gap.gap > Decimal.zero
                ? '${Money.format(gap.current)} of ${Money.format(gap.recommended)} — ${Money.format(gap.gap)} short'
                : 'Well covered (${Money.format(gap.current)})',
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(color: AppColors.darkOnSurfaceMuted),
          ),
        ],
      ),
    );
  }
}
