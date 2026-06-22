import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/money_format.dart';
import '../../../domain/entities/recurring_rule.dart';
import '../../../domain/entities/transaction.dart';
import '../../../presentation/data_gate.dart';
import '../providers/category_providers.dart';
import '../providers/recurring_providers.dart';

class RecurringScreen extends StatelessWidget {
  const RecurringScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Recurring transactions')),
      body: const DataGate(child: _Body()),
    );
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
      body: rules.isEmpty
          ? const Center(child: Text('No recurring rules yet.'))
          : ListView(
              children: [
                for (final r in rules)
                  ListTile(
                    leading: Icon(r.type == TxnType.income
                        ? Icons.repeat
                        : Icons.repeat_on),
                    title: Text(
                        '${Money.format(r.amount)} · ${byId[r.categoryId] ?? ''}'),
                    subtitle: Text(
                        '${r.frequency.key} · next ${r.nextRun.toIso8601String().substring(0, 10)}'),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () =>
                          ref.read(recurringActionsProvider).delete(r.id),
                    ),
                  ),
              ],
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: cats.isEmpty ? null : () => _add(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('Add rule'),
      ),
    );
  }

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final amount = TextEditingController();
    final cats = ref.read(categoryListProvider).valueOrNull ?? const [];
    String? categoryId = cats.first.id;
    var type = TxnType.expense;
    var freq = Frequency.monthly;

    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('New recurring rule'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: amount,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'Amount (₹)', prefixText: '₹ '),
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
              DropdownButtonFormField<Frequency>(
                initialValue: freq,
                decoration: const InputDecoration(labelText: 'Frequency'),
                items: [
                  for (final f in Frequency.values)
                    DropdownMenuItem(value: f, child: Text(f.key)),
                ],
                onChanged: (v) => setState(() => freq = v ?? freq),
              ),
              SegmentedButton<TxnType>(
                segments: const [
                  ButtonSegment(value: TxnType.expense, label: Text('Expense')),
                  ButtonSegment(value: TxnType.income, label: Text('Income')),
                ],
                selected: {type},
                onSelectionChanged: (s) => setState(() => type = s.first),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                final a = Decimal.tryParse(amount.text.trim());
                if (a == null || a <= Decimal.zero || categoryId == null) return;
                ref.read(recurringActionsProvider).add(
                      amount: a,
                      type: type,
                      categoryId: categoryId!,
                      frequency: freq,
                      firstRun: DateTime.now(),
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
