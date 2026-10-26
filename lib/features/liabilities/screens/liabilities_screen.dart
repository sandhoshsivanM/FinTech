import '../../../core/help/info_hint.dart';
import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import 'package:khazana_domain/entities/liability.dart';
import 'package:khazana_domain/services/debt_calculator.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
import '../../../presentation/stat_tile.dart';
import '../../../presentation/zentra_kit.dart';
import '../providers/liability_providers.dart';

class LiabilitiesScreen extends StatelessWidget {
  const LiabilitiesScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(body: const DataGate(child: _Body()));
  }
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final liabilities =
        ref.watch(liabilityListProvider).valueOrNull ?? const [];
    final calc = ref.watch(debtCalculatorProvider);
    final totalDebt = liabilities.fold(Decimal.zero, (s, l) => s + l.principal);

    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              KpiGrid(
                children: [
                  StatTile(
                    label: 'Total outstanding',
                    term: 'liabilities',
                    value: Money.format(totalDebt),
                    valueColor: totalDebt > Decimal.zero
                        ? context.colors.expense
                        : null,
                    footer:
                        '${liabilities.length} ${liabilities.length == 1 ? 'debt' : 'debts'}',
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              if (liabilities.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(AppSpacing.xl),
                  child: Center(child: Text('No liabilities tracked.')),
                ),
              for (final l in liabilities)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: InkWell(
                    onTap: () => _add(context, ref, existing: l),
                    borderRadius: BorderRadius.circular(AppRadii.card),
                    child: GlassCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              TypeChip(
                                l.kind == LiabilityKind.creditCard
                                    ? 'Credit card'
                                    : 'Loan',
                              ),
                              const Spacer(),
                              IconAction(
                                icon: Icons.delete_outline,
                                tooltip: 'Delete',
                                onPressed: () => ref
                                    .read(liabilityActionsProvider)
                                    .delete(l.id),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Text(l.name, style: text.titleLarge),
                          const SizedBox(height: AppSpacing.md),
                          Text(
                            'Outstanding',
                            style: text.bodySmall?.copyWith(color: muted),
                          ),
                          Text(
                            Money.format(l.principal),
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w300,
                              letterSpacing: -0.5,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${l.aprPct}% APR'
                            '${l.termMonths != null ? ' · EMI ${Money.format(calc.emi(l.principal, l.aprPct, l.termMonths!))}' : ''}',
                            style: text.bodySmall?.copyWith(color: muted),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: liabilities.isEmpty
                      ? null
                      : () => _simulate(context, ref, liabilities),
                  icon: const Icon(Icons.calculate_outlined),
                  label: const Text('Payoff plan'),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => _add(context, ref),
                  icon: const Icon(Icons.add),
                  label: const Text('Add'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _add(
    BuildContext context,
    WidgetRef ref, {
    Liability? existing,
  }) async {
    // Passing [existing] opens the same form prefilled; saving keeps its id.
    final name = TextEditingController(text: existing?.name ?? '');
    final principal = TextEditingController(
      text: existing?.principal.toString() ?? '',
    );
    final apr = TextEditingController(text: existing?.aprPct.toString() ?? '');
    final term = TextEditingController(
      text: existing?.termMonths?.toString() ?? '',
    );
    var kind = existing?.kind ?? LiabilityKind.creditCard;

    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: InfoHint.titled(
            Text(existing == null ? 'Add liability' : 'Edit liability'),
            'liabilities.form',
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: name,
                  decoration: const InputDecoration(labelText: 'Name'),
                ),
                SegmentedButton<LiabilityKind>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(
                      value: LiabilityKind.creditCard,
                      label: Text('Card'),
                    ),
                    ButtonSegment(
                      value: LiabilityKind.loan,
                      label: Text('Loan'),
                    ),
                  ],
                  selected: {kind},
                  onSelectionChanged: (s) => setState(() => kind = s.first),
                ),
                TextField(
                  controller: principal,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Outstanding (₹)',
                    prefixText: '₹ ',
                  ),
                ),
                TextField(
                  controller: apr,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'APR %'),
                ),
                if (kind == LiabilityKind.loan)
                  TextField(
                    controller: term,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Term (months)',
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
                final p = Decimal.tryParse(principal.text.trim());
                final a = Decimal.tryParse(apr.text.trim());
                if (p == null || a == null || name.text.trim().isEmpty) return;
                final actions = ref.read(liabilityActionsProvider);
                // Only loans have a term; a card switched from loan drops it.
                final termMonths = kind == LiabilityKind.loan
                    ? int.tryParse(term.text.trim())
                    : null;
                if (existing != null) {
                  actions.update(
                    Liability(
                      id: existing.id,
                      vaultId: existing.vaultId,
                      name: name.text.trim(),
                      kind: kind,
                      principal: p,
                      aprPct: a,
                      termMonths: termMonths,
                    ),
                  );
                } else {
                  actions.add(
                    name: name.text.trim(),
                    kind: kind,
                    principal: p,
                    aprPct: a,
                    termMonths: int.tryParse(term.text.trim()),
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

  Future<void> _simulate(
    BuildContext context,
    WidgetRef ref,
    List<Liability> liabilities,
  ) async {
    final budget = TextEditingController();
    var strategy = PayoffStrategy.avalanche;

    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          PayoffResult? result;
          final amt = Decimal.tryParse(budget.text.trim());
          if (amt != null && amt > Decimal.zero) {
            result = ref
                .read(liabilityActionsProvider)
                .simulate(liabilities, amt, strategy);
          }
          return AlertDialog(
            title: InfoHint.titled(
              const Text('Debt payoff plan'),
              'liabilities.payoffSimulator',
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: budget,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Monthly payment (₹)',
                    prefixText: '₹ ',
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: AppSpacing.sm),
                SegmentedButton<PayoffStrategy>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(
                      value: PayoffStrategy.avalanche,
                      label: Text('Avalanche'),
                    ),
                    ButtonSegment(
                      value: PayoffStrategy.snowball,
                      label: Text('Snowball'),
                    ),
                  ],
                  selected: {strategy},
                  onSelectionChanged: (s) => setState(() => strategy = s.first),
                ),
                const SizedBox(height: AppSpacing.md),
                if (result != null)
                  result.feasible
                      ? Text(
                          'Debt-free in ${result.monthsToDebtFree} months.\n'
                          'Total interest: ${Money.format(result.totalInterest)}',
                          textAlign: TextAlign.center,
                        )
                      : Text(
                          'That payment is too low to cover interest. Increase it.',
                          style: TextStyle(color: context.colors.expense),
                        ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Close'),
              ),
            ],
          );
        },
      ),
    );
  }
}
