import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../presentation/data_gate.dart';
import '../providers/fx_providers.dart';

/// Settings > Currency (PRD §12B): manual FX-rate entry + stored history.
class CurrencySettingsScreen extends StatelessWidget {
  const CurrencySettingsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Currency')),
      body: const DataGate(child: _Body()),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rates = ref.watch(fxRatesProvider).valueOrNull ?? const [];
    return Scaffold(
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          const Text(
            'Exchange rates are used to convert foreign holdings into your '
            'vault currency. Enter rates manually if no internet is available.',
          ),
          const SizedBox(height: AppSpacing.md),
          if (rates.isEmpty)
            const Padding(
              padding: EdgeInsets.all(AppSpacing.md),
              child: Text('No exchange rates stored yet.'),
            )
          else
            for (final r in rates)
              ListTile(
                leading: const Icon(Icons.currency_exchange),
                title: Text('1 ${r.baseCurrency} = ${r.rate} ${r.quoteCurrency}'),
                subtitle: Text(
                    '${r.source} · ${DateFormat('d MMM yyyy').format(r.fetchedAt)}'),
              ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _add(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('Add rate'),
      ),
    );
  }

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final base = TextEditingController(text: 'INR');
    final quote = TextEditingController(text: 'USD');
    final rate = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add exchange rate'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                    child: TextField(
                        controller: base,
                        decoration:
                            const InputDecoration(labelText: 'Base (ISO)'))),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                    child: TextField(
                        controller: quote,
                        decoration:
                            const InputDecoration(labelText: 'Quote (ISO)'))),
              ],
            ),
            TextField(
              controller: rate,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                  labelText: 'Rate (quote per 1 base)'),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              final r = Decimal.tryParse(rate.text.trim());
              if (r == null ||
                  r <= Decimal.zero ||
                  base.text.trim().isEmpty ||
                  quote.text.trim().isEmpty) {
                return;
              }
              ref.read(fxActionsProvider).addManual(
                    base.text,
                    quote.text,
                    r,
                    DateTime.now().millisecondsSinceEpoch,
                  );
              Navigator.pop(context);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}
