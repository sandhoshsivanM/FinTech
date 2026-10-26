import '../../../core/help/info_hint.dart';
import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import '../../../presentation/zentra_kit.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import 'package:khazana_domain/entities/recurring_rule.dart';
import 'package:khazana_domain/entities/transaction.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/empty_state.dart';
import '../../../presentation/glass_card.dart';
import '../providers/category_providers.dart';
import '../providers/recurring_providers.dart';
import 'add_transaction_screen.dart' show AccountPicker;

class RecurringScreen extends StatelessWidget {
  const RecurringScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(body: const DataGate(child: _Body()));
  }
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rules = ref.watch(recurringListProvider).valueOrNull ?? const [];
    final cats = ref.watch(categoryListProvider).valueOrNull ?? const [];
    final byId = {for (final c in cats) c.id: c.name};

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: rules.isEmpty
          ? EmptyState(
              icon: Icons.repeat_rounded,
              title: 'No recurring rules yet',
              message:
                  'Rent, EMIs, subscriptions — anything that repeats on a '
                  'schedule. Khazana posts each one automatically on its due '
                  'date so your cash flow stays complete.',
              action: FilledButton.icon(
                onPressed: cats.isEmpty ? null : () => _openForm(context, ref),
                icon: const Icon(Icons.add),
                label: const Text('Add your first rule'),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.md,
                0,
                AppSpacing.md,
                96,
              ),
              children: [
                _MonthlyTotals(rules: rules),
                const SizedBox(height: AppSpacing.sm),
                Align(
                  alignment: Alignment.centerRight,
                  child: OutlinedButton.icon(
                    onPressed: () => _runDue(context, ref),
                    icon: const Icon(Icons.play_arrow_rounded),
                    label: const Text('Run due'),
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                for (final r in rules) ...[
                  _RuleCard(
                    rule: r,
                    category: byId[r.categoryId] ?? 'Uncategorised',
                    onPost: () => _postNow(context, ref, r),
                    onEdit: () => _openForm(context, ref, editing: r),
                    onDelete: () =>
                        ref.read(recurringActionsProvider).delete(r.id),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                ],
              ],
            ),
      floatingActionButton: rules.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: cats.isEmpty ? null : () => _openForm(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('Add rule'),
            ),
    );
  }

  /// Posts every rule that is due, catching up missed runs. Nothing posts on
  /// its own: like the web app, this is the one place a schedule becomes
  /// transactions.
  Future<void> _runDue(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final n = await ref.read(recurringActionsProvider).processDue();
    messenger.showSnackBar(SnackBar(
      content: Text(n == 0
          ? 'No transactions due right now.'
          : 'Posted $n transaction${n == 1 ? '' : 's'}.'),
    ));
  }

  /// Posts ONE occurrence, at the date and amount it actually happened. The
  /// schedule is a prediction; the posting is a record.
  Future<void> _postNow(
      BuildContext context, WidgetRef ref, RecurringRule rule) async {
    final messenger = ScaffoldMessenger.of(context);
    final amount = TextEditingController(text: rule.amount.toString());
    var date = rule.nextRun;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Post this occurrence'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: amount,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'Amount (₹)',
                  prefixText: '₹ ',
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event_outlined),
                title: const Text('Date'),
                subtitle: Text(_RuleCard._date(date)),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: date,
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                  );
                  if (picked != null) setState(() => date = picked);
                },
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final a = Decimal.tryParse(amount.text.trim());
                if (a == null || a <= Decimal.zero) return;
                Navigator.pop(context, true);
              },
              child: const Text('Post'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;
    final a = Decimal.tryParse(amount.text.trim());
    if (a == null) return;
    await ref
        .read(recurringActionsProvider)
        .postOnce(rule, date: date, amount: a);
    messenger.showSnackBar(SnackBar(
      content: Text('Posted ${rule.merchant ?? 'rule'}. Nothing else was run.'),
    ));
  }

  /// Add form, or edit form when [editing] is given. A bill's price changes
  /// without the bill stopping, so the rule is corrected in place and keeps its
  /// id and schedule.
  Future<void> _openForm(BuildContext context, WidgetRef ref,
      {RecurringRule? editing}) async {
    final amount = TextEditingController(text: editing?.amount.toString());
    final merchant = TextEditingController(text: editing?.merchant);
    final cats = ref.read(categoryListProvider).valueOrNull ?? const [];
    String? categoryId = editing?.categoryId ?? cats.first.id;
    String? accountId = editing?.accountId;
    var type = editing?.type ?? TxnType.expense;
    var freq = editing?.frequency ?? Frequency.monthly;
    var nextRun = editing?.nextRun ?? DateTime.now();

    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(editing == null ? 'New recurring rule' : 'Edit rule'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: amount,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Amount (₹)',
                    prefixText: '₹ ',
                  ),
                ),
                TextField(
                  controller: merchant,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Merchant (optional)',
                  ),
                ),
                DropdownButtonFormField<String>(
                  initialValue: categoryId,
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: [
                    for (final c in cats)
                      DropdownMenuItem(value: c.id, child: Text(c.name)),
                  ],
                  onChanged: (v) => setState(() => categoryId = v),
                ),
                AccountPicker(
                  value: accountId,
                  onChanged: (id) => setState(() => accountId = id),
                ),
                DropdownButtonFormField<Frequency>(
                  initialValue: freq,
                  decoration: const InputDecoration(labelText: 'Frequency'),
                  items: [
                    for (final f in Frequency.values)
                      DropdownMenuItem(value: f, child: Text(f.key)),
                  ],
                  onChanged: (v) => setState(() => freq = v ?? freq),
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.event_outlined),
                  title: Text(editing == null ? 'First run' : 'Next run'),
                  subtitle: Text(_RuleCard._date(nextRun)),
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: nextRun,
                      firstDate: DateTime(2000),
                      lastDate: DateTime(2100),
                    );
                    if (picked != null) setState(() => nextRun = picked);
                  },
                ),
                SegmentedButton<TxnType>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(
                        value: TxnType.expense, label: Text('Expense')),
                    ButtonSegment(value: TxnType.income, label: Text('Income')),
                  ],
                  selected: {type},
                  onSelectionChanged: (s) => setState(() => type = s.first),
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
                final a = Decimal.tryParse(amount.text.trim());
                if (a == null || a <= Decimal.zero || categoryId == null) {
                  return;
                }
                final name = merchant.text.trim();
                final actions = ref.read(recurringActionsProvider);
                if (editing == null) {
                  actions.add(
                    amount: a,
                    type: type,
                    categoryId: categoryId!,
                    frequency: freq,
                    firstRun: nextRun,
                    merchant: name.isEmpty ? null : name,
                    accountId: accountId,
                  );
                } else {
                  actions.update(
                    rule: editing,
                    amount: a,
                    type: type,
                    categoryId: categoryId!,
                    frequency: freq,
                    nextRun: nextRun,
                    merchant: name.isEmpty ? null : name,
                    accountId: accountId,
                  );
                }
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

/// What the schedule costs per month, at a glance.
///
/// A list of rules at mixed frequencies — a daily coffee, a weekly cleaner, a
/// yearly premium — does not add up to anything the eye can compute. Converting
/// each to its monthly equivalent is the number people actually want.
class _MonthlyTotals extends StatelessWidget {
  const _MonthlyTotals({required this.rules});

  final List<RecurringRule> rules;

  /// Monthly equivalent of one rule.
  ///
  /// Weekly uses 52/12, not 4 — four weeks a month undercounts by ~8%, which on
  /// a large standing order is a visible error rather than a rounding one.
  static Decimal _perMonth(RecurringRule r) => switch (r.frequency) {
    Frequency.daily => r.amount * Decimal.fromInt(30),
    Frequency.weekly =>
      (r.amount * Decimal.fromInt(52) / Decimal.fromInt(12)).toDecimal(
        scaleOnInfinitePrecision: 2,
      ),
    Frequency.monthly => r.amount,
    Frequency.yearly => (r.amount / Decimal.fromInt(12)).toDecimal(
      scaleOnInfinitePrecision: 2,
    ),
  };

  @override
  Widget build(BuildContext context) {
    var out = Decimal.zero;
    var inn = Decimal.zero;
    for (final r in rules) {
      if (r.type == TxnType.income) {
        inn += _perMonth(r);
      } else {
        out += _perMonth(r);
      }
    }
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    Widget cell(String label, Decimal value, Color color, [String? hint]) =>
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      label,
                      style: text.labelMedium?.copyWith(color: muted),
                    ),
                  ),
                  if (hint != null) InfoHint(hint),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                Money.format(value),
                style: text.titleMedium?.copyWith(
                  fontWeight: FontWeight.w500,
                  color: color,
                ),
              ),
            ],
          ),
        );

    return GlassCard(
      child: Row(
        children: [
          cell(
            'Committed each month',
            out,
            context.colors.expense,
            'recurring.page',
          ),
          if (inn > Decimal.zero)
            cell('Expected in', inn, context.colors.income),
          Expanded(
            child: Text(
              '${rules.length} rule${rules.length == 1 ? '' : 's'}',
              textAlign: TextAlign.right,
              style: text.bodyMedium?.copyWith(color: muted),
            ),
          ),
        ],
      ),
    );
  }
}

class _RuleCard extends StatelessWidget {
  const _RuleCard({
    required this.rule,
    required this.category,
    required this.onPost,
    required this.onEdit,
    required this.onDelete,
  });

  final RecurringRule rule;
  final String category;
  final VoidCallback onPost;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  static const _months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  /// "4 Aug 2026" rather than "2026-08-04". An ISO date is for a log file; a
  /// person reading their own bills wants the month by name.
  static String _date(DateTime d) =>
      '${d.day} ${_months[d.month - 1]} ${d.year}';

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final income = rule.type == TxnType.income;
    final tint = income ? context.colors.income : context.colors.expense;

    final days = rule.nextRun.difference(DateTime.now()).inDays;
    final due = days < 0
        ? 'overdue'
        : days == 0
        ? 'due today'
        : days == 1
        ? 'due tomorrow'
        : 'in $days days';

    return GlassCard(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.md,
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: tint.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(
              income ? Icons.sync_alt : Icons.repeat_rounded,
              size: 20,
              color: tint,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  category,
                  style: text.titleSmall?.copyWith(fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 2),
                Text(
                  '${rule.frequency.key} · next ${_date(rule.nextRun)} · $due',
                  style: text.bodySmall?.copyWith(color: muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Text(
            '${income ? '+' : '−'}${Money.format(rule.amount)}',
            style: text.titleSmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: tint,
            ),
          ),
          IconAction(
            icon: Icons.check_circle_outline,
            tooltip: 'Post now',
            onPressed: onPost,
          ),
          IconAction(
            icon: Icons.edit_outlined,
            tooltip: 'Edit rule',
            onPressed: onEdit,
          ),
          IconAction(
            icon: Icons.delete_outline,
            tooltip: 'Delete rule',
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}
