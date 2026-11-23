import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/semantic_colors.dart';
import '../../../core/utils/money_format.dart';
import 'package:khazana_domain/entities/asset_group.dart';
import 'package:khazana_domain/entities/sip.dart';
import 'package:khazana_domain/services/sip_schedule.dart';
import '../../../presentation/asset_group_colors.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
import '../providers/sip_providers.dart';

/// Monthly SIPs: what is due, what is coming, and one tap to record each.
///
/// Nothing is recorded until the user taps Mark done, so a bounced or paused
/// SIP never shows units the user does not own.
class SipsScreen extends ConsumerWidget {
  const SipsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final plansAsync = ref.watch(sipPlansProvider);
    final instAsync = ref.watch(sipInstalmentsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('SIPs'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.md),
            child: FilledButton.icon(
              onPressed: () => context.go(Routes.investmentsAddSip),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add SIP'),
            ),
          ),
        ],
      ),
      body: DataGate(
        child: plansAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('Could not load SIPs: $e')),
          data: (plans) => _Body(
            plans: plans,
            instalments: instAsync.valueOrNull ?? const [],
          ),
        ),
      ),
    );
  }
}

final _dayMonth = DateFormat('d MMM');
String _short(CalendarDate d) => _dayMonth.format(d.toDateTime());

String _ordinal(int n) {
  if (n >= 11 && n <= 13) return '${n}th';
  return switch (n % 10) {
    1 => '${n}st',
    2 => '${n}nd',
    3 => '${n}rd',
    _ => '${n}th',
  };
}

class _Body extends ConsumerWidget {
  const _Body({required this.plans, required this.instalments});

  final List<SipPlan> plans;
  final List<SipInstalment> instalments;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final today = ref.watch(sipTodayProvider);
    final text = Theme.of(context).textTheme;

    if (plans.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'No SIPs yet',
                  style: text.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  'Add the SIPs you pay at your bank or broker. Khazana '
                  'reminds you on each date and records the units when you '
                  'tap Mark done. It never moves money.',
                  style: text.bodyMedium,
                ),
                const SizedBox(height: AppSpacing.md),
                FilledButton.icon(
                  onPressed: () => context.go(Routes.investmentsAddSip),
                  icon: const Icon(Icons.add),
                  label: const Text('Add a SIP'),
                ),
              ],
            ),
          ),
        ],
      );
    }

    final active = plans.where((p) => p.active).toList();
    final targets =
        ref.watch(allocationTargetsProvider).valueOrNull ?? const {};
    final hasTargets = targets.values.fold<int>(0, (a, b) => a + b) == 100;
    final warning = hasTargets
        ? sipMixWarning(sipMix(plans, targets, today))
        : null;

    // Due cards: every occurrence in the look-back window, answered or not, so
    // an answer stays undoable for as long as it would have stayed due.
    final due = <(SipPlan, CalendarDate, SipInstalment?)>[];
    for (final p in active) {
      for (final d in occurrences(p, today.addDays(-kSipLookbackDays), today)) {
        final answer = instalments
            .where((i) => i.sipId == p.id && i.dueDate == d)
            .firstOrNull;
        due.add((p, d, answer));
      }
    }
    due.sort((a, b) => a.$2.compareTo(b.$2));

    final upcoming = [for (final p in plans) (p, nextDue(p, today))]
      ..sort((a, b) {
        if (a.$2 == null) return 1;
        if (b.$2 == null) return -1;
        return a.$2!.compareTo(b.$2!);
      });
    final next = upcoming.firstOrNull?.$2;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        _Hero(
          monthly: monthlyTotal(plans, today),
          active: active.length,
          thisFy: investedThisFy(instalments, today),
          next: next,
        ),
        if (warning != null) ...[
          const SizedBox(height: AppSpacing.md),
          _MixWarning(row: warning),
        ],
        if (due.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.lg),
          Text('Due', style: text.labelLarge),
          const SizedBox(height: AppSpacing.sm),
          for (final d in due) ...[
            _DueCard(plan: d.$1, due: d.$2, answer: d.$3),
            const SizedBox(height: AppSpacing.sm),
          ],
        ],
        const SizedBox(height: AppSpacing.lg),
        Text('Your SIPs', style: text.labelLarge),
        const SizedBox(height: AppSpacing.sm),
        GlassCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (final (i, u) in upcoming.indexed) ...[
                if (i > 0) const Divider(height: 1),
                _PlanTile(plan: u.$1, next: u.$2, today: today),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          'A reminder arrives on each SIP date. Nothing is recorded until you '
          'tap Mark done, so a bounced or paused SIP never shows units you '
          "don't own.",
          style: text.bodySmall,
        ),
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({
    required this.monthly,
    required this.active,
    required this.thisFy,
    required this.next,
  });

  final Decimal monthly;
  final int active;
  final Decimal thisFy;
  final CalendarDate? next;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    Widget cell(String label, String value) => Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: text.labelSmall),
          const SizedBox(height: 2),
          Text(
            value,
            style: text.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Monthly SIPs', style: text.labelMedium),
          const SizedBox(height: AppSpacing.xs),
          Text(
            Money.whole(monthly),
            style: text.headlineMedium?.copyWith(
              fontWeight: FontWeight.w300,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              cell('Active', '$active SIP${active == 1 ? '' : 's'}'),
              cell('This year', Money.whole(thisFy)),
              cell('Next', next == null ? '—' : _short(next!)),
            ],
          ),
        ],
      ),
    );
  }
}

class _MixWarning extends StatelessWidget {
  const _MixWarning({required this.row});

  final SipMixRow row;

  @override
  Widget build(BuildContext context) {
    final s =
        Theme.of(context).extension<SemanticColors>() ??
        SemanticColors.of(Theme.of(context).brightness);
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: s.warn.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadii.input),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Your SIPs grow ${row.group.label} faster than its target',
            style: text.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            '${Money.whole(row.amount)} a month goes to ${row.group.label} '
            '(${row.sipPct}%). Target is ${row.targetPct}%. Consider a SIP '
            'in a group that is under target.',
            style: text.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _DueCard extends ConsumerWidget {
  const _DueCard({required this.plan, required this.due, this.answer});

  final SipPlan plan;
  final CalendarDate due;
  final SipInstalment? answer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final s =
        Theme.of(context).extension<SemanticColors>() ??
        SemanticColors.of(Theme.of(context).brightness);
    final today = ref.watch(sipTodayProvider);
    final amount = amountOn(plan, due);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final a = answer;

    Widget answered(String message, Color colour) => Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadii.input),
      ),
      child: Row(
        children: [
          Expanded(child: Text(message, style: text.bodySmall)),
          TextButton(
            onPressed: () => ref.read(sipActionsProvider).undo(a!.id),
            child: const Text('Undo'),
          ),
        ],
      ),
    );

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: groupColor(
                      AssetGroup.of(plan.assetType),
                      dark: dark,
                    ),
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      plan.name,
                      style: text.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      '${AssetGroup.of(plan.assetType).label} · every month on the ${_ordinal(plan.dayOfMonth)}',
                      style: text.bodySmall,
                    ),
                  ],
                ),
              ),
              Text(
                Money.whole(amount),
                style: text.titleSmall?.copyWith(fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          if (a == null) ...[
            // Status above the buttons, not beside them: three items in one
            // row overflowed a 360dp phone.
            Text(
              due == today
                  ? 'Due today, ${_short(due)}'
                  : 'Was due ${_short(due)}',
              style: text.bodySmall?.copyWith(
                color: s.warn,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () =>
                        ref.read(sipActionsProvider).markSkipped(plan, due),
                    child: const Text('Skipped'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: FilledButton(
                    onPressed: () => _markDone(context, ref, amount),
                    child: const Text('Mark done'),
                  ),
                ),
              ],
            ),
          ] else if (a.status == SipInstalmentStatus.done)
            answered(
              'Recorded: ${a.units?.toStringAsFixed(3)} units at ₹${a.nav}',
              s.income,
            )
          else
            answered(
              'Skipped this month. Nothing recorded.',
              Theme.of(context).disabledColor,
            ),
        ],
      ),
    );
  }

  Future<void> _markDone(
    BuildContext context,
    WidgetRef ref,
    Decimal amount,
  ) async {
    final actions = ref.read(sipActionsProvider);
    final nav = await actions.latestNav(plan.instrumentId);
    if (!context.mounted) return;
    final result = await showModalBottomSheet<(Decimal, Decimal)>(
      context: context,
      isScrollControlled: true,
      builder: (_) =>
          MarkDoneSheet(name: plan.name, due: due, amount: amount, nav: nav),
    );
    if (result == null) return;
    await actions.markDone(plan, due, amount: result.$1, nav: result.$2);
  }
}

/// Confirms the amount and the NAV the units were allotted at.
///
/// NAV is prefilled from the last price Khazana knows and stays editable: the
/// allotment NAV is on the AMC's confirmation, and a guessed one would make
/// the units — and every return computed from them — wrong.
class MarkDoneSheet extends StatefulWidget {
  const MarkDoneSheet({
    super.key,
    required this.name,
    required this.due,
    required this.amount,
    this.nav,
  });

  final String name;
  final CalendarDate due;
  final Decimal amount;
  final Decimal? nav;

  @override
  State<MarkDoneSheet> createState() => _MarkDoneSheetState();
}

class _MarkDoneSheetState extends State<MarkDoneSheet> {
  late final _amount = TextEditingController(text: widget.amount.toString());
  late final _nav = TextEditingController(text: widget.nav?.toString() ?? '');

  @override
  void dispose() {
    _amount.dispose();
    _nav.dispose();
    super.dispose();
  }

  Decimal? _parse(String s) => Decimal.tryParse(s.trim().replaceAll(',', ''));

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final amount = _parse(_amount.text);
    final nav = _parse(_nav.text);
    final valid =
        amount != null &&
        amount > Decimal.zero &&
        nav != null &&
        nav > Decimal.zero;
    final money = [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))];

    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Record ${widget.name}',
            style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
          Text('SIP date ${_short(widget.due)}', style: text.bodySmall),
          const SizedBox(height: AppSpacing.md),
          TextField(
            key: const Key('markdone-amount'),
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: money,
            decoration: const InputDecoration(
              labelText: 'Amount invested',
              prefixText: '₹',
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            key: const Key('markdone-nav'),
            controller: _nav,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: money,
            decoration: InputDecoration(
              labelText: 'NAV on that day',
              prefixText: '₹',
              helperText: widget.nav == null
                  ? 'No price saved yet. Use the NAV on your confirmation.'
                  : 'Last known price. Change it to the NAV on your confirmation.',
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            valid
                ? 'Records ${unitsFor(amount, nav).toStringAsFixed(3)} units'
                : 'Enter the amount and NAV',
            style: text.bodyMedium,
          ),
          const SizedBox(height: AppSpacing.md),
          FilledButton(
            key: const Key('markdone-confirm'),
            onPressed: valid
                ? () => Navigator.of(context).pop((amount, nav))
                : null,
            child: const Text('Record'),
          ),
        ],
      ),
    );
  }
}

class _PlanTile extends StatelessWidget {
  const _PlanTile({
    required this.plan,
    required this.next,
    required this.today,
  });

  final SipPlan plan;
  final CalendarDate? next;
  final CalendarDate today;

  @override
  Widget build(BuildContext context) {
    final group = AssetGroup.of(plan.assetType).label;
    final step = plan.stepUpPct > 0 ? ' · +${plan.stepUpPct}% each April' : '';
    final amount = amountOn(
      plan,
      next ?? (today < plan.startDate ? plan.startDate : today),
    );
    return ListTile(
      title: Text(plan.name, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(
        plan.active
            ? '$group · next ${next == null ? '—' : _short(next!)}$step'
            : '$group · paused',
      ),
      trailing: Text(
        Money.whole(amount),
        style: Theme.of(
          context,
        ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
      ),
      onTap: () => context.go(Routes.investmentsAddSip, extra: plan),
    );
  }
}
