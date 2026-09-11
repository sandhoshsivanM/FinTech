import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/liability.dart';
import '../../../domain/services/debt_calculator.dart';
import '../../../presentation/data_gate.dart';
import '../providers/liability_providers.dart';

class LiabilitiesScreen extends StatelessWidget {
  const LiabilitiesScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: const DataGate(child: _Body()),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final liabilities =
        ref.watch(liabilityListProvider).valueOrNull ?? const [];
    final calc = ref.watch(debtCalculatorProvider);
    final totalDebt =
        liabilities.fold(Decimal.zero, (s, l) => s + l.principal);

    return Column(
      children: [
        Card(
          margin: const EdgeInsets.all(AppSpacing.lg),
          child: ListTile(
            title: const Text('Total outstanding'),
            trailing: Text(Money.format(totalDebt),
                style: TextStyle(
                    fontWeight: FontWeight.bold, color: context.colors.expense)),
          ),
        ),
        Expanded(
          child: liabilities.isEmpty
              ? const Center(child: Text('No liabilities tracked.'))
              : ListView(
                  children: [
                    for (final l in liabilities)
                      ListTile(
                        leading: Icon(l.kind == LiabilityKind.creditCard
                            ? Icons.credit_card
                            : Icons.account_balance),
                        title: Text(l.name),
                        subtitle: Text(
                            '${l.aprPct}% APR'
                            '${l.termMonths != null ? ' · EMI ${Money.format(calc.emi(l.principal, l.aprPct, l.termMonths!))}' : ''}'),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(Money.format(l.principal)),
                            IconButton(
                              icon: const Icon(Icons.delete_outline),
                              tooltip: 'Delete',
                              onPressed: () => ref
                                  .read(liabilityActionsProvider)
                                  .delete(l.id),
                            ),
                          ],
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

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final name = TextEditingController();
    final principal = TextEditingController();
    final apr = TextEditingController();
    final term = TextEditingController();
    var kind = LiabilityKind.creditCard;

    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Add liability'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: name,
                    decoration: const InputDecoration(labelText: 'Name')),
                SegmentedButton<LiabilityKind>(
                  segments: const [
                    ButtonSegment(
                        value: LiabilityKind.creditCard,
                        label: Text('Card')),
                    ButtonSegment(
                        value: LiabilityKind.loan, label: Text('Loan')),
                  ],
                  selected: {kind},
                  onSelectionChanged: (s) => setState(() => kind = s.first),
                ),
                TextField(
                    controller: principal,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Outstanding (₹)', prefixText: '₹ ')),
                TextField(
                    controller: apr,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'APR %')),
                if (kind == LiabilityKind.loan)
                  TextField(
                      controller: term,
                      keyboardType: TextInputType.number,
                      decoration:
                          const InputDecoration(labelText: 'Term (months)')),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                final p = Decimal.tryParse(principal.text.trim());
                final a = Decimal.tryParse(apr.text.trim());
                if (p == null || a == null || name.text.trim().isEmpty) return;
                ref.read(liabilityActionsProvider).add(
                      name: name.text.trim(),
                      kind: kind,
                      principal: p,
                      aprPct: a,
                      termMonths: int.tryParse(term.text.trim()),
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

  Future<void> _simulate(
      BuildContext context, WidgetRef ref, List<Liability> liabilities) async {
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
            title: const Text('Debt payoff plan'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: budget,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                      labelText: 'Monthly payment (₹)', prefixText: '₹ '),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: AppSpacing.sm),
                SegmentedButton<PayoffStrategy>(
                  segments: const [
                    ButtonSegment(
                        value: PayoffStrategy.avalanche,
                        label: Text('Avalanche')),
                    ButtonSegment(
                        value: PayoffStrategy.snowball,
                        label: Text('Snowball')),
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
                          style: TextStyle(color: context.colors.expense)),
              ],
            ),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Close')),
            ],
          );
        },
      ),
    );
  }
}
