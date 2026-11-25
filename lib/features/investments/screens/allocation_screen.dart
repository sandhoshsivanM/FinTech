import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/utils/money_format.dart';
import 'package:khazana_domain/entities/asset_group.dart';
import 'package:khazana_domain/services/allocation_targets.dart';
import 'package:khazana_domain/services/asset_hints.dart';
import 'package:khazana_domain/services/sip_schedule.dart';
import '../../../presentation/asset_group_colors.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
import '../providers/portfolio_providers.dart';
import '../providers/sip_providers.dart';

/// Target vs actual allocation, with targets edited in place.
///
/// Suggests where new money should go and nothing more: "Over by ₹X" is
/// deliberately not "Sell ₹X" — a sale has tax and exit-load consequences
/// this screen cannot see.
class AllocationScreen extends ConsumerStatefulWidget {
  const AllocationScreen({super.key});

  @override
  ConsumerState<AllocationScreen> createState() => _AllocationScreenState();
}

class _AllocationScreenState extends ConsumerState<AllocationScreen> {
  /// Non-null while editing: the draft targets.
  Map<AssetGroup, int>? _draft;
  final Set<AssetGroup> _open = {};
  bool _saving = false;

  void _startEdit(AllocationView v) {
    setState(() {
      _draft = Map.of(
        v.report.hasTargets || v.targets.isNotEmpty
            ? v.targets
            : suggestTargets(v.report),
      );
    });
  }

  Future<void> _save() async {
    final draft = _draft;
    if (draft == null) return;
    setState(() => _saving = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(sipActionsProvider).saveTargets(draft);
      if (!mounted) return;
      setState(() => _draft = null);
      messenger.showSnackBar(const SnackBar(content: Text('Targets saved')));
    } on Object catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Could not save: $e')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(allocationViewProvider);
    final editing = _draft != null;
    final draftTotal = _draft?.values.fold<int>(0, (a, b) => a + b) ?? 0;
    final canSave = editing && !_saving && validateTargets(_draft!) == null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Allocation'),
        actions: [
          if (editing) ...[
            TextButton(
              onPressed: () => setState(() => _draft = null),
              child: const Text('Cancel'),
            ),
            Padding(
              padding: const EdgeInsets.only(right: AppSpacing.md),
              child: FilledButton(
                key: const Key('allocation-save'),
                onPressed: canSave ? _save : null,
                child: const Text('Save'),
              ),
            ),
          ] else
            Padding(
              padding: const EdgeInsets.only(right: AppSpacing.md),
              child: FilledButton.tonal(
                key: const Key('allocation-edit'),
                onPressed: async.valueOrNull == null
                    ? null
                    : () => _startEdit(async.valueOrNull!),
                child: const Text('Edit targets'),
              ),
            ),
        ],
      ),
      body: DataGate(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('Could not load: $e')),
          data: (v) => _body(context, v, editing, draftTotal),
        ),
      ),
    );
  }

  Widget _body(
    BuildContext context,
    AllocationView v,
    bool editing,
    int draftTotal,
  ) {
    final r = v.report;
    final targets = _draft ?? v.targets;
    // While editing, recompute against the draft so gaps move with the
    // steppers.
    final shown = editing ? _recompute(v, targets) : r;
    final groups = <AssetGroup>{
      for (final row in shown.rows) row.group,
      if (editing) ...AssetGroup.values,
    };
    final rows = [
      for (final g in kAssetGroupOrder)
        if (groups.contains(g))
          shown.rows.where((x) => x.group == g).firstOrNull ??
              _emptyRow(g, targets[g] ?? 0),
    ];

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        if (editing)
          _TotalBanner(total: draftTotal)
        else if (!r.hasTargets)
          const _Banner(
            tone: _Tone.info,
            title: 'Set your targets',
            body:
                'Tap Edit targets. We start you from today\'s mix; '
                'targets must total 100%.',
          )
        else
          _DriftBanner(report: r),
        if (!editing) const _MisfiledCard(),
        if (v.unconverted.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Holdings in ${v.unconverted.join(', ')} are left out: no exchange rate is saved.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        _BarsCard(report: shown, targets: targets),
        const SizedBox(height: AppSpacing.md),
        for (final row in rows) ...[
          _GroupCard(
            row: row,
            total: shown.total,
            hasTargets: editing || r.hasTargets,
            open: _open.contains(row.group),
            editing: editing,
            onToggle: () => setState(
              () => _open.contains(row.group)
                  ? _open.remove(row.group)
                  : _open.add(row.group),
            ),
            onStep: (delta) => setState(() {
              final next = ((_draft![row.group] ?? 0) + delta).clamp(0, 100);
              _draft![row.group] = next;
            }),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
        const SizedBox(height: AppSpacing.sm),
        const _SipLinkCard(),
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }

  AllocationReport _recompute(AllocationView v, Map<AssetGroup, int> t) {
    // Rebuild inputs from the current report's children: one input per asset
    // type carries the same totals the report was built from.
    final inputs = [
      for (final row in v.report.rows)
        for (final c in row.children) AllocationInput(c.type, c.value),
    ];
    return targetVsActual(inputs, t);
  }

  AllocationRow _emptyRow(AssetGroup g, int target) => AllocationRow(
    group: g,
    value: Decimal.zero,
    actualPct: Decimal.zero,
    targetPct: target,
    targetValue: Decimal.zero,
    gapPct: Decimal.zero,
    status: AllocationStatus.onTrack,
    amount: Decimal.zero,
    children: const [],
  );
}

String _pct(Decimal d) => '${d.toString()}%';

String _gapText(AllocationRow r) => r.status == AllocationStatus.onTrack
    ? 'On track'
    : '${r.gapPct > Decimal.zero ? '+' : '−'}${r.gapPct.abs()}%';

String _actionText(AllocationRow r) => switch (r.status) {
  AllocationStatus.under => 'Add ${Money.whole(r.amount)}',
  AllocationStatus.over => 'Over by ${Money.whole(r.amount)}',
  AllocationStatus.onTrack => 'On track',
};

SemanticColors _sem(BuildContext context) =>
    Theme.of(context).extension<SemanticColors>() ??
    SemanticColors.of(Theme.of(context).brightness);

enum _Tone { warn, info, ok }

class _Banner extends StatelessWidget {
  const _Banner({required this.tone, required this.title, required this.body});

  final _Tone tone;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final s = _sem(context);
    final c = switch (tone) {
      _Tone.warn => s.warn,
      _Tone.info => s.info,
      _Tone.ok => s.income,
    };
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadii.input),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            tone == _Tone.ok ? Icons.check_circle_outline : Icons.info_outline,
            size: 20,
            color: c,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: text.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(body, style: text.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DriftBanner extends StatelessWidget {
  const _DriftBanner({required this.report});

  final AllocationReport report;

  @override
  Widget build(BuildContext context) {
    final under = report.under.toList();
    final off = under.length + report.over.length;
    if (off == 0) {
      return const _Banner(
        tone: _Tone.ok,
        title: 'All categories on track',
        body: 'Every group is within 2% of its target.',
      );
    }
    final names = under.map((r) => r.group.label).join(' and ');
    return _Banner(
      tone: _Tone.warn,
      title: '$off categor${off == 1 ? 'y is' : 'ies are'} off target',
      body: under.isEmpty
          ? 'Some groups are above target. Slow new money there; nothing is sold for you.'
          : 'Point new money and SIPs at $names first. Nothing is sold for you.',
    );
  }
}

class _TotalBanner extends StatelessWidget {
  const _TotalBanner({required this.total});

  final int total;

  @override
  Widget build(BuildContext context) {
    final ok = total == 100;
    return _Banner(
      tone: ok ? _Tone.ok : _Tone.warn,
      title: 'Targets total $total%',
      body: ok
          ? 'Ready to save.'
          : total < 100
          ? 'Add ${100 - total}% more to reach 100%.'
          : 'Remove ${total - 100}% to get to 100%.',
    );
  }
}

/// Actual and target as two stacked bars, in the fixed group order.
class _BarsCard extends StatelessWidget {
  const _BarsCard({required this.report, required this.targets});

  final AllocationReport report;
  final Map<AssetGroup, int> targets;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final text = Theme.of(context).textTheme;
    final actual = <(AssetGroup, double)>[
      for (final r in report.rows)
        if (r.value > Decimal.zero) (r.group, r.actualPct.toDouble()),
    ];
    final target = <(AssetGroup, double)>[
      for (final g in kAssetGroupOrder)
        if ((targets[g] ?? 0) > 0) (g, (targets[g]!).toDouble()),
    ];

    Widget bar(String key, List<(AssetGroup, double)> parts) => ClipRRect(
      borderRadius: BorderRadius.circular(6),
      // Full width and stretched rows: a childless ColoredBox takes the
      // smallest size its constraints allow, so under the Column's loose
      // width and the Row's loose height it would paint nothing.
      child: SizedBox(
        key: Key(key),
        height: 14,
        width: double.infinity,
        child: parts.isEmpty
            ? ColoredBox(color: Theme.of(context).dividerColor)
            : Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final p in parts)
                    Expanded(
                      flex: (p.$2 * 10).round().clamp(1, 1000),
                      child: ColoredBox(color: groupColor(p.$1, dark: dark)),
                    ),
                ],
              ),
      ),
    );

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Target vs Actual',
                  style: text.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Text(
                '${Money.whole(report.total)} invested',
                style: text.bodySmall,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text('Actual', style: text.labelSmall),
          const SizedBox(height: AppSpacing.xs),
          bar('allocation-bar-actual', actual),
          const SizedBox(height: AppSpacing.sm),
          Text('Target', style: text.labelSmall),
          const SizedBox(height: AppSpacing.xs),
          bar('allocation-bar-target', target),
        ],
      ),
    );
  }
}

class _GroupCard extends StatelessWidget {
  const _GroupCard({
    required this.row,
    required this.total,
    required this.hasTargets,
    required this.open,
    required this.editing,
    required this.onToggle,
    required this.onStep,
  });

  final AllocationRow row;
  final Decimal total;
  final bool hasTargets;
  final bool open;
  final bool editing;
  final VoidCallback onToggle;
  final void Function(int delta) onStep;

  @override
  Widget build(BuildContext context) {
    final s = _sem(context);
    final text = Theme.of(context).textTheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final chipColor = switch (row.status) {
      AllocationStatus.under => s.warn,
      AllocationStatus.over => s.info,
      AllocationStatus.onTrack => s.income,
    };

    Widget stat(
      String label,
      String big,
      String? small, {
      CrossAxisAlignment align = CrossAxisAlignment.start,
      Color? colour,
    }) => Column(
      crossAxisAlignment: align,
      children: [
        Text(label, style: text.labelSmall),
        const SizedBox(height: 2),
        Text(
          big,
          style: text.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
            color: colour,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        if (small != null) Text(small, style: text.bodySmall),
      ],
    );

    return GlassCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(AppRadii.card),
            onTap: editing ? null : onToggle,
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: groupColor(row.group, dark: dark),
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          row.group.label,
                          style: text.titleSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (hasTargets && !editing)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: chipColor.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(AppRadii.pill),
                          ),
                          child: Text(
                            _gapText(row),
                            style: text.labelMedium?.copyWith(
                              color: chipColor,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      if (!editing && row.children.isNotEmpty)
                        Icon(
                          open ? Icons.expand_less : Icons.expand_more,
                          size: 20,
                        ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: stat(
                          'Actual',
                          _pct(row.actualPct),
                          Money.whole(row.value),
                        ),
                      ),
                      Expanded(
                        child: stat(
                          'Target',
                          hasTargets ? '${row.targetPct}%' : '—',
                          hasTargets && !editing
                              ? Money.whole(row.targetValue)
                              : null,
                        ),
                      ),
                      if (hasTargets && !editing)
                        Expanded(
                          child: stat(
                            'Action',
                            _actionText(row),
                            null,
                            align: CrossAxisAlignment.end,
                            colour: row.status == AllocationStatus.under
                                ? null
                                : Theme.of(context).textTheme.bodySmall?.color,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (editing)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                0,
                AppSpacing.lg,
                AppSpacing.md,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Target for ${row.group.label}',
                      style: text.bodySmall,
                    ),
                  ),
                  IconButton.outlined(
                    tooltip: 'Lower ${row.group.label} target',
                    onPressed: row.targetPct > 0 ? () => onStep(-1) : null,
                    icon: const Icon(Icons.remove),
                  ),
                  SizedBox(
                    width: 56,
                    child: Text(
                      '${row.targetPct}%',
                      textAlign: TextAlign.center,
                      style: text.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  IconButton.outlined(
                    tooltip: 'Raise ${row.group.label} target',
                    onPressed: row.targetPct < 100 ? () => onStep(1) : null,
                    icon: const Icon(Icons.add),
                  ),
                ],
              ),
            ),
          if (open && !editing)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                0,
                AppSpacing.lg,
                AppSpacing.md,
              ),
              child: Column(
                children: [
                  for (final c in row.children)
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        vertical: AppSpacing.xs,
                      ),
                      child: Row(
                        children: [
                          const SizedBox(width: 20),
                          Expanded(
                            child: Text(
                              '${c.type.label} · ${c.count}',
                              style: text.bodyMedium,
                            ),
                          ),
                          Text(_pct(c.actualPct), style: text.bodyMedium),
                          const SizedBox(width: AppSpacing.md),
                          SizedBox(
                            width: 96,
                            child: Text(
                              Money.whole(c.value),
                              textAlign: TextAlign.right,
                              style: text.bodySmall,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _SipLinkCard extends ConsumerWidget {
  const _SipLinkCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final plans = ref.watch(sipPlansProvider).valueOrNull ?? const [];
    final today = ref.watch(sipTodayProvider);
    final total = monthlyTotal(plans, today);
    final active = plans.where((p) => p.active).length;
    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        leading: const Icon(Icons.event_repeat_outlined),
        title: Text(
          active == 0 ? 'SIPs' : 'SIPs · ${Money.whole(total)} a month',
        ),
        subtitle: Text(
          active == 0
              ? 'Track a monthly SIP and record each one with a tap'
              : '$active active',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.go(Routes.investmentsSips),
      ),
    );
  }
}

/// Import and Add lot start every row as Equity / ETF, so a GOLDBEES can sit
/// in Equity and make every gap on this screen wrong. Offers the fix; changes
/// nothing until it is tapped.
class _MisfiledCard extends ConsumerWidget {
  const _MisfiledCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final instruments = ref.watch(instrumentsProvider).valueOrNull ?? const [];
    final misfiled = [
      for (final i in instruments)
        if (misfiledAs(i.kind, i.symbol ?? '', i.name) case final to?) (i, to),
    ];
    if (misfiled.isEmpty) return const SizedBox.shrink();
    final text = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.md),
      child: GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              misfiled.length == 1
                  ? '1 holding looks misfiled'
                  : '${misfiled.length} holdings look misfiled',
              style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Filed as equity, so they count toward Equity here and are '
              'taxed as equity. Nothing changes until you choose.',
              style: text.bodySmall,
            ),
            for (final (i, to) in misfiled)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${i.symbol ?? i.name}: ${i.kind.label} → ${to.label}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    TextButton(
                      key: Key('refile-${i.id}'),
                      onPressed: () => ref
                          .read(portfolioActionsProvider)
                          .setInstrumentKind(i.id, to),
                      child: Text('File as ${to.label}'),
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
