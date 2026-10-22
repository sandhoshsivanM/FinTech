import '../../../core/help/info_hint.dart';
import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import 'package:khazana_domain/entities/insurance.dart';
import 'package:khazana_domain/services/insurance_advisor.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/empty_state.dart';
import '../../../presentation/glass_card.dart';
import '../../../presentation/stat_tile.dart';
import '../../../presentation/zentra_kit.dart';
import '../../home/widgets/depth.dart';
import '../providers/insurance_providers.dart';

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
    return Scaffold(body: const DataGate(child: _Body()));
  }
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final policies = ref.watch(insuranceListProvider).valueOrNull ?? const [];
    final gaps = ref.watch(coverageGapsProvider);
    final advisor = ref.watch(insuranceAdvisorProvider);
    final totalCover = policies.fold(Decimal.zero, (s, p) => s + p.coverAmount);
    final premium = advisor.annualPremiumTotal(policies);

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              KpiGrid(
                children: [
                  StatTile(
                    label: 'Total cover',
                    term: 'sumAssured',
                    value: Money.format(totalCover),
                    footer:
                        '${policies.length} ${policies.length == 1 ? 'policy' : 'policies'}',
                  ),
                  StatTile(
                    label: 'Annual premium',
                    value: Money.format(premium),
                    footer: 'sum of all',
                  ),
                  StatTile(
                    label: 'Policies',
                    value: '${policies.length}',
                    footer: 'tracked',
                  ),
                  if (gaps.isNotEmpty)
                    StatTile(
                      label: '${gaps.first.label} gap',
                      term: 'coverageGap',
                      value: Money.format(gaps.first.gap),
                      valueColor: gaps.first.gap > Decimal.zero
                          ? context.colors.expense
                          : null,
                      footer: '${gaps.first.coveredPct}% of guideline',
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),

              TrayCard(
                title: 'Coverage gap',
                help: 'insurance.coverageGap',
                footer: Text(
                  'Guideline only, not advice — life ≈ '
                  '${InsuranceAdvisor.lifeCoverMultiple}× annual income; '
                  'health ≥ ₹5L.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
                child: Column(
                  children: [
                    for (var i = 0; i < gaps.length; i++) ...[
                      if (i > 0) const SizedBox(height: AppSpacing.md),
                      _GapRow(gap: gaps[i]),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),

              if (policies.isEmpty)
                const EmptyState(
                  icon: Icons.umbrella_outlined,
                  title: 'No policies tracked yet',
                  message:
                      'Add your life and health cover and the gap analysis '
                      'above becomes a real reading of where you stand, rather '
                      'than 0% against a guideline.',
                )
              else
                for (final p in policies)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: _PolicyCard(
                      policy: p,
                      onDelete: () =>
                          ref.read(insuranceActionsProvider).delete(p.id),
                    ),
                  ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
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
          title: InfoHint.titled(const Text('Add policy'), 'insurance.form'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: name,
                  decoration: const InputDecoration(labelText: 'Name'),
                ),
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
                  decoration: const InputDecoration(
                    labelText: 'Provider (optional)',
                  ),
                ),
                TextField(
                  controller: cover,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Cover amount (₹)',
                    prefixText: '₹ ',
                  ),
                ),
                TextField(
                  controller: premium,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Annual premium (₹)',
                    prefixText: '₹ ',
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final c = Decimal.tryParse(cover.text.trim());
                final pr = Decimal.tryParse(premium.text.trim());
                if (name.text.trim().isEmpty || c == null) return;
                ref
                    .read(insuranceActionsProvider)
                    .save(
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

class _PolicyCard extends StatelessWidget {
  const _PolicyCard({required this.policy, required this.onDelete});

  final Insurance policy;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final p = policy;
    return SizedBox(
      width: double.infinity,
      child: GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                TypeChip(_typeLabel(p.type)),
                const Spacer(),
                IconAction(
                  icon: Icons.delete_outline,
                  tooltip: 'Delete',
                  onPressed: onDelete,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(p.name, style: text.titleLarge),
            if (p.provider != null && p.provider!.isNotEmpty)
              Text(p.provider!, style: text.bodySmall?.copyWith(color: muted)),
            const SizedBox(height: AppSpacing.md),
            Text('Sum assured', style: text.bodySmall?.copyWith(color: muted)),
            Text(
              Money.format(p.coverAmount),
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w300,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              'Premium ${Money.format(p.premium)} a year',
              style: text.bodySmall?.copyWith(color: muted),
            ),
          ],
        ),
      ),
    );
  }
}

class _GapRow extends StatelessWidget {
  const _GapRow({required this.gap});
  final CoverageGap gap;
  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final frac = (gap.coveredPct / 100).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GaugeRow(
          label: gap.label,
          fraction: frac,
          hue: Hue.forCoverage(gap.coveredPct),
          value: Money.format(gap.current),
          limit: Money.format(gap.recommended),
        ),
        const SizedBox(height: 4),
        Text(
          gap.gap > Decimal.zero
              ? '${Money.format(gap.gap)} short'
              : 'Well covered',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(color: muted),
        ),
      ],
    );
  }
}
