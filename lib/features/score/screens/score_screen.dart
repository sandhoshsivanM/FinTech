import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../domain/services/financial_health.dart';
import '../../../domain/services/narrative_engine.dart';
import '../../../presentation/charts/area_chart.dart';
import '../../../presentation/charts/gauge_chart.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
import '../../reports/providers/dashboard_providers.dart';

/// Where each category's data actually comes from, so an untracked card can
/// send the user somewhere useful instead of just saying no.
const _categoryRoutes = <String, (String, String)>{
  'wealth': (Routes.investments, 'Add a holding'),
  'protection': (Routes.insurance, 'Add a policy'),
  'efficiency': (Routes.budget, 'Set a budget'),
  'future': (Routes.goals, 'Add a goal'),
};

/// The Score tab: the weekly "why" behind the Dashboard's grade.
class ScoreScreen extends ConsumerWidget {
  const ScoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: const SafeArea(child: DataGate(child: _Body())),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final health = ref.watch(financialHealthProvider);
    if (health == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final history = ref.watch(scoreHistoryProvider);

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        _ScoreHero(health: health),
        const SizedBox(height: AppSpacing.md),
        const _MethodCard(),
        const SizedBox(height: AppSpacing.md),
        const _WeeklyReportCard(),
        const SizedBox(height: AppSpacing.md),
        for (final c in health.categories) ...[
          _CategoryCard(category: c),
          const SizedBox(height: AppSpacing.sm),
        ],
        const SizedBox(height: AppSpacing.sm),
        _HistoryCard(history: history),
        const SizedBox(height: AppSpacing.md),
        const _FooterLinks(),
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }
}

class _ScoreHero extends StatelessWidget {
  const _ScoreHero({required this.health});
  final HealthScore health;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;

    return GlassCard(
      child: Column(
        children: [
          GaugeChart(
            value: health.score?.toDouble(),
            size: 200,
            sublabel: health.grade,
          ),
          const SizedBox(height: AppSpacing.sm),
          if (health.isPartial)
            // The denominator, stated. This is what lets the number stay
            // comparable week to week without overclaiming what it covers.
            Text(
              'Based on ${health.trackedCategoryCount} of '
              '${health.categories.length} areas',
              style: text.labelMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            health.summary,
            textAlign: TextAlign.center,
            style: text.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

/// "How is this calculated?" — the score's own workings, on the page.
///
/// The confusing property is not the weighting, it is renormalisation.
/// Untracked areas leave the denominator entirely, so adding a first insurance
/// policy can move the score DOWN even though the person is better protected
/// than they were the day before: Protection has stopped being excluded and
/// started being judged. Unstated, the number looks arbitrary at exactly the
/// moment someone has done the right thing — the worst point to lose them.
///
/// Weights and bands are read from [FinancialHealth] rather than retyped, so
/// this cannot drift out of agreement with the score it describes.
class _MethodCard extends StatelessWidget {
  const _MethodCard();

  static const _areas = <(String, double, String)>[
    (
      'Wealth',
      FinancialHealth.wealthWeight,
      'How your assets are growing, how much of them is invested, and whether '
          'too much sits in one place.',
    ),
    (
      'Protection',
      FinancialHealth.protectionWeight,
      'Your emergency fund, and whether your life and health cover match your '
          'income.',
    ),
    (
      'Efficiency',
      FinancialHealth.efficiencyWeight,
      'What share of your income you keep, how much debt you carry against '
          'your assets, and whether you stay inside your budgets.',
    ),
    (
      'Future',
      FinancialHealth.futureWeight,
      'Retirement assets, the pace you are hitting your goals at, and how much '
          'of your portfolio can still grow.',
    ),
  ];

  static const _bands = <(String, String)>[
    ('85 and above', 'Excellent'),
    ('70–84', 'Strong'),
    ('55–69', 'Fair'),
    ('40–54', 'Needs work'),
    ('Below 40', 'At risk'),
  ];

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final muted = text.bodySmall?.copyWith(
        color: scheme.onSurfaceVariant, height: 1.4);
    final total = _areas.fold<double>(0, (s, a) => s + a.$2);

    // Not a card. This is a disclosure row: one line of text and a chevron,
    // which in a bordered card cost the same vertical space as the narrative
    // card beside it and carried the same visual weight as a screen's worth of
    // figures. A card should mean "here is a discrete object"; asking a
    // question is not one.
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      child: Theme(
        // The default expansion divider fights the rules this screen already
        // has; the row is separated by space instead.
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: EdgeInsets.zero,
          childrenPadding: const EdgeInsets.only(bottom: AppSpacing.md),
          leading: Icon(Icons.help_outline,
              size: 20, color: scheme.onSurfaceVariant),
          title: Text('How is this calculated?',
              style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Four areas, each worth a fixed number of points out of '
                    '${total.toInt()}. Inside an area, each check contributes '
                    'its own share — the figure beside an area is the points it '
                    'earned out of the points it can carry.',
                    style: muted,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  for (final (label, weight, blurb) in _areas)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(label,
                                  style: text.bodySmall?.copyWith(
                                      fontWeight: FontWeight.w700)),
                              Text(' · ${weight.toInt()} points',
                                  style: text.bodySmall
                                      ?.copyWith(color: scheme.onSurfaceVariant)),
                            ],
                          ),
                          Text(blurb, style: muted),
                        ],
                      ),
                    ),
                  const SizedBox(height: AppSpacing.xs),
                  Text('Areas you have not tracked are left out',
                      style: text.bodySmall
                          ?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    'An area with no data is not scored zero — it is removed '
                    'from the total entirely, and the remaining areas are '
                    'measured against each other. This keeps the score honest '
                    'about what it has seen, but it has one consequence worth '
                    'knowing: adding your first policy, goal or budget can move '
                    'the score down, because that area has stopped being '
                    'excluded and started being judged. That is the score '
                    'learning something about you, not you getting worse.',
                    style: muted,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Below ${FinancialHealth.minGradableWeight.toInt()} points '
                    'of tracked areas — fewer than two of the four — you get a '
                    'number but no one-word grade. There is not yet enough to '
                    'stand behind a verdict.',
                    style: muted,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text('Grades',
                      style: text.bodySmall
                          ?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: AppSpacing.xs),
                  for (final (range, label) in _bands)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Row(
                        children: [
                          SizedBox(
                            width: 96,
                            child: Text(range,
                                style: text.bodySmall?.copyWith(
                                    color: scheme.onSurfaceVariant)),
                          ),
                          Text(label, style: text.bodySmall),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The narrative paragraph: up to three sentences about the period.
///
/// Every sentence comes from a template in [NarrativeEngine] and is checked
/// against the banned-phrase list by test. Naming a figure is description;
/// telling someone what to do about it is advice, which this app does not give.
class _WeeklyReportCard extends ConsumerWidget {
  const _WeeklyReportCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final narratives = ref.watch(narrativeProvider);
    if (narratives.isEmpty) return const SizedBox.shrink();

    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final report = narratives.take(3).map((n) => n.text).join(' ');

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.auto_awesome, size: 18, color: context.colors.accent),
              const SizedBox(width: AppSpacing.xs),
              Text('This period',
                  style:
                      text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(report, style: text.bodyMedium),
          const SizedBox(height: AppSpacing.sm),
          Text(kNarrativeDisclaimer,
              style: text.labelSmall?.copyWith(color: scheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

/// One category, expandable in place — the plan is explicit that opening a
/// category is disclosure, not navigation.
class _CategoryCard extends StatelessWidget {
  const _CategoryCard({required this.category});
  final HealthCategory category;

  static Color _band(SemanticColors c, double f) => f >= 0.7
      ? c.income
      : f >= 0.4
          ? c.budgetWarn
          : c.expense;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final fraction = category.fraction;
    final tracked = fraction != null;
    final cta = _categoryRoutes[category.key];

    return GlassCard(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      child: Theme(
        // The default expansion divider fights the card's own hairline border.
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: EdgeInsets.zero,
          childrenPadding: const EdgeInsets.only(bottom: AppSpacing.sm),
          // An untracked category has nothing to disclose. Leaving the chevron
          // there would promise detail that is not behind it.
          trailing: tracked ? null : const SizedBox.shrink(),
          enabled: tracked,
          title: Row(
            children: [
              Expanded(
                child: Text(category.label,
                    style:
                        text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              ),
              // "23/30" alone never said what the 30 was. Naming the unit once
              // is what makes the four areas read as a weighting rather than
              // four unrelated fractions.
              Text(
                tracked
                    ? '${category.score!.round()}/${category.weight.toInt()} pts'
                    : 'Not yet tracked',
                style: text.labelMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                  fontWeight: tracked ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                  child: LinearProgressIndicator(
                    value: fraction ?? 0,
                    minHeight: 6,
                    valueColor: AlwaysStoppedAnimation(
                      tracked ? _band(context.colors, fraction) : Colors.transparent,
                    ),
                    backgroundColor:
                        scheme.onSurfaceVariant.withValues(alpha: 0.15),
                  ),
                ),
                const SizedBox(height: 6),
                Text(category.detail,
                    style:
                        text.labelSmall?.copyWith(color: scheme.onSurfaceVariant)),
                if (!tracked && cta != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: OutlinedButton.icon(
                      onPressed: () => context.go(cta.$1),
                      icon: const Icon(Icons.add, size: 16),
                      label: Text(cta.$2),
                      style: OutlinedButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          children: [
            for (final m in category.metrics)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: _MetricRow(metric: m),
              ),
          ],
        ),
      ),
    );
  }
}

class _MetricRow extends StatelessWidget {
  const _MetricRow({required this.metric});
  final HealthMetric metric;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final value = metric.value;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 6,
          height: 6,
          margin: const EdgeInsets.only(top: 6, right: AppSpacing.sm),
          decoration: BoxDecoration(
            color: value == null
                ? scheme.onSurfaceVariant.withValues(alpha: 0.4)
                : _CategoryCard._band(context.colors, value),
            shape: BoxShape.circle,
          ),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(metric.label, style: text.labelMedium)),
                  Text(
                    // No percentage for an untracked metric. A number here
                    // would be the fabrication the whole design avoids.
                    value == null ? 'Not tracked' : '${(value * 100).round()}%',
                    style: text.labelSmall
                        ?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
              Text(metric.detail,
                  style:
                      text.labelSmall?.copyWith(color: scheme.onSurfaceVariant)),
            ],
          ),
        ),
      ],
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.history});
  final List<double> history;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Score history',
              style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: AppSpacing.sm),
          AreaChart(
            values: history,
            height: 120,
            emptyLabel: 'Your score trend will appear here',
            semanticLabel: history.length < 2
                ? null
                : 'Score history, ${history.length} points, '
                    'latest ${history.last.round()}',
          ),
        ],
      ),
    );
  }
}

class _FooterLinks extends StatelessWidget {
  const _FooterLinks();

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        // Reports lost its tab to this screen, so it keeps a way back here as
        // well as on the Dashboard.
        OutlinedButton.icon(
          onPressed: () => context.go(Routes.reports),
          icon: const Icon(Icons.bar_chart_outlined, size: 18),
          label: const Text('Full reports'),
        ),
        OutlinedButton.icon(
          onPressed: () => context.go(Routes.safetyNet),
          icon: const Icon(Icons.health_and_safety_outlined, size: 18),
          label: const Text('Safety Net'),
        ),
      ],
    );
  }
}
