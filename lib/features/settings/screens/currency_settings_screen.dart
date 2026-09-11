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

class _Body extends ConsumerStatefulWidget {
  const _Body();

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final ref = this.ref;
    final rates = ref.watch(fxRatesProvider).valueOrNull ?? const [];
    final base = ref.watch(baseCurrencyProvider);
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.public),
            title: const Text('Base currency'),
            subtitle: Text('Totals are reported in $base'),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: _pickBase,
          ),
          const Divider(),
          Text(
            'Rates convert foreign holdings into $base. Fetching gets every '
            'currency in one request, so the source never learns which ones '
            'you hold.',
            style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              FilledButton.icon(
                onPressed: _busy ? null : _refresh,
                icon: _busy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.cloud_download_outlined, size: 18),
                label: const Text('Fetch rates'),
              ),
              const SizedBox(width: AppSpacing.sm),
              TextButton.icon(
                onPressed: () => _add(context, ref),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add manually'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          if (rates.isEmpty)
            const Padding(
              padding: EdgeInsets.all(AppSpacing.lg),
              child: Text('No exchange rates stored yet.'),
            )
          else
            for (final r in rates)
              ListTile(
                leading: const Icon(Icons.currency_exchange),
                title: Text('1 ${r.baseCurrency} = ${r.rate} ${r.quoteCurrency}'),
                subtitle: Text(
                    '${_sourceLabel(r.source)} · '
                    '${DateFormat('d MMM yyyy').format(r.fetchedAt)}'),
              ),
        ],
      ),
    );
  }

  /// Reference rates are published per working day, so the stored date is the
  /// honest label — not "just now", which a Sunday fetch would make untrue.
  static String _sourceLabel(String source) =>
      source == 'ecb' ? 'ECB reference rate' : 'Manual entry';

  Future<void> _pickBase() async {
    final controller =
        TextEditingController(text: ref.read(baseCurrencyProvider));
    final picked = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Base currency'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(
            labelText: 'ISO code',
            hintText: 'INR, USD, EUR, GBP, AED…',
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    final code = picked?.trim();
    if (code == null || code.isEmpty) return;
    await ref.read(baseCurrencyProvider.notifier).set(code);
  }

  Future<void> _refresh() async {
    setState(() => _busy = true);
    try {
      final result = await ref.read(fxActionsProvider).refreshLive();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('${result.updated} rates · '
            '${result.source} as of '
            '${DateFormat('d MMM yyyy').format(result.asOf)}'),
      ));
    } on Object catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
