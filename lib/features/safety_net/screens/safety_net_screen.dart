import '../../../core/help/info_hint.dart';
import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/services/safety_net.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
import '../../../presentation/zentra_kit.dart';
import '../../home/home_palette.dart';
import '../../home/widgets/depth.dart';
import '../providers/safety_net_providers.dart';

/// Read-only "Safety Net" readiness dashboard — parity with the web app's
/// `/safety-net` page. One score over emergency fund + insurance + safe assets.
class SafetyNetScreen extends StatelessWidget {
  const SafetyNetScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(body: const DataGate(child: _Body()));
  }
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sn = ref.watch(safetyNetProvider);
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        // Readiness hero: the score ring, then the sentence.
        GlassCard(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.xl,
          ),
          child: Column(
            children: [
              ScoreRing(value: sn.score.toDouble(), label: sn.grade),
              const SizedBox(height: AppSpacing.lg),
              InfoHint.titled(
                Text(
                  'Safety-net readiness',
                  style: text.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
                'safety-net.readiness',
              ),
              const SizedBox(height: 4),
              Text(
                sn.summary,
                textAlign: TextAlign.center,
                style: text.bodyLarge,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),

        for (final c in sn.components) ...[
          _ComponentCard(component: c),
          const SizedBox(height: AppSpacing.md),
        ],

        Text(
          'Guideline only, not advice — life ≈ 10× annual income; health ≥ ₹5L. '
          'Annual premiums: ${Money.format(sn.premium)}.',
          style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
        ),
      ],
    );
  }
}

String? _helpFor(String label) => switch (label) {
  'Emergency fund' => 'safety-net.emergencyFund',
  'Life cover' || 'Health cover' => 'safety-net.insuranceCover',
  'Safe & retirement assets' => 'safety-net.safeAssets',
  _ => null,
};

class _ComponentCard extends StatelessWidget {
  const _ComponentCard({required this.component});
  final SafetyComponent component;

  @override
  Widget build(BuildContext context) {
    final pct = component.coveredPct;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return SizedBox(
      width: double.infinity,
      child: GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_helpFor(component.label) == null)
              Text(component.label, style: text.titleMedium)
            else
              InfoHint.titled(
                Text(component.label, style: text.titleMedium),
                _helpFor(component.label)!,
              ),
            const SizedBox(height: AppSpacing.md),
            HomeTray(
              child: GaugeRow(
                label: component.gap > Decimal.zero
                    ? 'Covered'
                    : 'Well covered',
                fraction: (pct / 100).clamp(0.0, 1.0),
                hue: Hue.forCoverage(pct),
                value: Money.format(component.current),
                limit: Money.format(component.recommended),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            if (component.gap > Decimal.zero)
              Text(
                '${Money.format(component.gap)} short',
                style: text.bodySmall?.copyWith(color: muted),
              ),
            Text(
              component.detail,
              style: text.bodySmall?.copyWith(color: muted),
            ),
          ],
        ),
      ),
    );
  }
}
