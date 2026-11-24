import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/semantic_colors.dart';
import 'package:khazana_domain/entities/asset_group.dart';
import 'package:khazana_domain/entities/portfolio.dart';
import 'package:khazana_domain/entities/sip.dart';
import 'package:khazana_domain/services/allocation_targets.dart';
import 'package:khazana_domain/services/sip_schedule.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
import '../providers/portfolio_providers.dart';
import '../providers/sip_providers.dart';

const _uuid = Uuid();
const kStepUpChoices = [5, 10, 15, 20];

/// Adds a SIP, or edits / pauses / deletes one when [editing] is given.
class AddSipScreen extends ConsumerStatefulWidget {
  const AddSipScreen({super.key, this.editing});

  final SipPlan? editing;

  @override
  ConsumerState<AddSipScreen> createState() => _AddSipScreenState();
}

class _AddSipScreenState extends ConsumerState<AddSipScreen> {
  late final _amount = TextEditingController(
    text: widget.editing?.amount.toString() ?? '',
  );
  String? _instrumentId;
  late int _day = widget.editing?.dayOfMonth ?? DateTime.now().day;
  late CalendarDate _start =
      widget.editing?.startDate ?? CalendarDate.of(DateTime.now());
  late bool _stepOn = (widget.editing?.stepUpPct ?? 0) > 0;
  late int _step = (widget.editing?.stepUpPct ?? 0) > 0
      ? widget.editing!.stepUpPct
      : 10;
  late bool _remind = widget.editing?.remind ?? true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _instrumentId = widget.editing?.instrumentId;
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Decimal? get _amountValue =>
      Decimal.tryParse(_amount.text.trim().replaceAll(',', ''));

  Future<void> _save(List<Instrument> instruments) async {
    final amount = _amountValue;
    final inst = instruments.where((i) => i.id == _instrumentId).firstOrNull;
    if (amount == null || amount <= Decimal.zero || inst == null) return;
    setState(() => _saving = true);
    final e = widget.editing;
    final plan = SipPlan(
      id: e?.id ?? _uuid.v4(),
      vaultId: ref.read(currentVaultIdProvider),
      instrumentId: inst.id,
      name: inst.name,
      assetType: inst.kind,
      amount: amount,
      dayOfMonth: _day,
      startDate: _start,
      stepUpPct: _stepOn ? _step : 0,
      remind: _remind,
      active: e?.active ?? true,
    );
    try {
      await ref.read(sipActionsProvider).savePlan(plan);
      if (!mounted) return;
      context.go(Routes.investmentsSips);
    } on Object catch (err) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Could not save: $err')));
    }
  }

  Future<void> _togglePause() async {
    final e = widget.editing!;
    await ref.read(sipActionsProvider).savePlan(e.copyWith(active: !e.active));
    if (mounted) context.go(Routes.investmentsSips);
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Delete this SIP?'),
        content: const Text(
          'Its reminders stop. Units you already recorded stay in your holdings.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await ref.read(sipActionsProvider).deletePlan(widget.editing!.id);
    if (mounted) context.go(Routes.investmentsSips);
  }

  Future<void> _pickStart() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _start.toDateTime(),
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 365 * 2)),
    );
    if (d != null) setState(() => _start = CalendarDate.of(d));
  }

  @override
  Widget build(BuildContext context) {
    final instruments = ref.watch(instrumentsProvider).valueOrNull ?? const [];
    final text = Theme.of(context).textTheme;
    final editing = widget.editing;
    final inst = instruments.where((i) => i.id == _instrumentId).firstOrNull;
    final canSave =
        !_saving &&
        inst != null &&
        (_amountValue ?? Decimal.zero) > Decimal.zero;

    return Scaffold(
      appBar: AppBar(
        title: Text(editing == null ? 'Add a SIP' : 'Edit SIP'),
        actions: [
          if (editing != null)
            PopupMenuButton<String>(
              onSelected: (v) => v == 'pause' ? _togglePause() : _delete(),
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: 'pause',
                  child: Text(editing.active ? 'Pause' : 'Resume'),
                ),
                const PopupMenuItem(value: 'delete', child: Text('Delete')),
              ],
            ),
        ],
      ),
      body: DataGate(
        child: instruments.isEmpty
            ? Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: GlassCard(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Add the fund first',
                        style: text.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      const Text(
                        'A SIP buys into a holding. Add the fund as a holding, then come back.',
                      ),
                      const SizedBox(height: AppSpacing.md),
                      FilledButton(
                        onPressed: () => context.go(Routes.investmentsAddLot),
                        child: const Text('Add a holding'),
                      ),
                    ],
                  ),
                ),
              )
            : ListView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                children: [
                  GlassCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        DropdownButtonFormField<String>(
                          key: const Key('sip-fund'),
                          dropdownColor: AppTheme.menuSurface(context),
                          isExpanded: true,
                          initialValue: _instrumentId,
                          decoration: const InputDecoration(
                            labelText: 'Fund or holding',
                          ),
                          items: [
                            for (final i in instruments)
                              DropdownMenuItem(
                                value: i.id,
                                child: Text(
                                  '${i.name} (${i.group.label})',
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                          onChanged: (v) => setState(() => _instrumentId = v),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        TextField(
                          key: const Key('sip-amount'),
                          controller: _amount,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          inputFormatters: [
                            FilteringTextInputFormatter.allow(
                              RegExp(r'[0-9.,]'),
                            ),
                          ],
                          decoration: const InputDecoration(
                            labelText: 'Amount each month',
                            prefixText: '₹',
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        Row(
                          children: [
                            Expanded(
                              child: DropdownButtonFormField<int>(
                                // Half a phone's width is too narrow for
                                // "23 of month" at larger text sizes: fill the
                                // field and ellipsize instead of overflowing.
                                isExpanded: true,
                                dropdownColor: AppTheme.menuSurface(context),
                                initialValue: _day,
                                decoration: const InputDecoration(
                                  labelText: 'SIP date',
                                ),
                                items: [
                                  for (var d = 1; d <= 31; d++)
                                    DropdownMenuItem(
                                      value: d,
                                      child: Text(
                                        d >= 29
                                            ? '$d (or month end)'
                                            : '$d of month',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                ],
                                onChanged: (v) =>
                                    setState(() => _day = v ?? _day),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.md),
                            Expanded(
                              child: InkWell(
                                onTap: _pickStart,
                                child: InputDecorator(
                                  decoration: const InputDecoration(
                                    labelText: 'Starts',
                                  ),
                                  child: Text(
                                    DateFormat(
                                      'd MMM y',
                                    ).format(_start.toDateTime()),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  GlassCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Yearly step-up'),
                          subtitle: const Text('Raise the amount every April'),
                          value: _stepOn,
                          onChanged: (v) => setState(() => _stepOn = v),
                        ),
                        if (_stepOn)
                          Wrap(
                            spacing: AppSpacing.sm,
                            children: [
                              for (final p in kStepUpChoices)
                                ChoiceChip(
                                  label: Text('$p%'),
                                  selected: _step == p,
                                  onSelected: (_) => setState(() => _step = p),
                                ),
                            ],
                          ),
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Remind me on each SIP date'),
                          subtitle: const Text(
                            'At your evening digest time. Tap Mark done to record the units.',
                          ),
                          value: _remind,
                          onChanged: (v) => setState(() => _remind = v),
                        ),
                      ],
                    ),
                  ),
                  if (inst != null) ...[
                    const SizedBox(height: AppSpacing.md),
                    _HelpsNote(group: inst.group, monthly: _amountValue),
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  FilledButton(
                    key: const Key('sip-save'),
                    onPressed: canSave ? () => _save(instruments) : null,
                    child: Text(editing == null ? 'Save SIP' : 'Save changes'),
                  ),
                ],
              ),
      ),
    );
  }
}

/// How this SIP moves the group it feeds, against the user's targets.
class _HelpsNote extends ConsumerWidget {
  const _HelpsNote({required this.group, required this.monthly});

  final AssetGroup group;
  final Decimal? monthly;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final view = ref.watch(allocationViewProvider).valueOrNull;
    if (view == null || !view.report.hasTargets) return const SizedBox.shrink();
    final row = view.report.rows.where((r) => r.group == group).firstOrNull;
    if (row == null) return const SizedBox.shrink();

    final s =
        Theme.of(context).extension<SemanticColors>() ??
        SemanticColors.of(Theme.of(context).brightness);
    final text = Theme.of(context).textTheme;
    final (title, body, colour) = switch (row.status) {
      AllocationStatus.under => (
        'Helps your allocation',
        () {
          final m = monthsToClose(row.amount, monthly ?? Decimal.zero);
          final gap = row.gapPct.abs();
          return m == null
              ? '${group.label} is $gap% under target.'
              : '${group.label} is $gap% under target. This SIP closes the gap in about $m month${m == 1 ? '' : 's'}.';
        }(),
        s.income,
      ),
      AllocationStatus.over => (
        'Adds to a group above target',
        '${group.label} is already ${row.gapPct}% over its target.',
        s.warn,
      ),
      AllocationStatus.onTrack => (
        'Keeps your allocation',
        '${group.label} is on target.',
        s.info,
      ),
    };
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadii.input),
      ),
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
    );
  }
}
