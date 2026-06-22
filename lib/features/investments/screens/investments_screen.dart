import 'package:decimal/decimal.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/holding.dart';
import '../../../domain/services/portfolio_diff.dart';
import '../../../domain/services/tax_rule_engine.dart';
import '../../../presentation/data_gate.dart';
import '../../import/broker_parser.dart' show IBrokerParser, ZerodhaXlsxParser, UpstoxCsvParser;
import '../providers/investment_providers.dart';

class InvestmentsScreen extends StatelessWidget {
  const InvestmentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Investments'),
        actions: const [_RefreshPricesButton()],
      ),
      body: const DataGate(child: _InvestmentsBody()),
    );
  }
}

class _RefreshPricesButton extends ConsumerStatefulWidget {
  const _RefreshPricesButton();
  @override
  ConsumerState<_RefreshPricesButton> createState() => _RefreshState();
}

class _RefreshState extends ConsumerState<_RefreshPricesButton> {
  bool _busy = false;
  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Refresh live prices',
      icon: _busy
          ? const SizedBox(
              width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : const Icon(Icons.refresh),
      onPressed: _busy
          ? null
          : () async {
              final messenger = ScaffoldMessenger.of(context);
              setState(() => _busy = true);
              final source =
                  await ref.read(portfolioImportProvider).refreshPrices();
              if (mounted) setState(() => _busy = false);
              messenger.showSnackBar(SnackBar(
                content: Text(source == null
                    ? 'Prices unavailable (offline or no provider).'
                    : 'Prices updated via $source.'),
              ));
            },
    );
  }
}

class _InvestmentsBody extends ConsumerWidget {
  const _InvestmentsBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final holdings = ref.watch(holdingListProvider).valueOrNull ?? const [];
    final invested = holdings.fold(Decimal.zero, (s, h) => s + h.investedValue);
    final market = holdings.fold(Decimal.zero, (s, h) => s + h.marketValue);
    final pnl = market - invested;

    return Column(
      children: [
        Card(
          margin: const EdgeInsets.all(AppSpacing.md),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _Stat(label: 'Invested', value: invested),
                _Stat(label: 'Value', value: market),
                _Stat(
                  label: 'P&L',
                  value: pnl,
                  color: pnl < Decimal.zero
                      ? AppColors.expense
                      : AppColors.income,
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: holdings.isEmpty
              ? const Center(child: Text('No holdings. Import from Zerodha.'))
              : ListView(
                  children: [
                    for (final h in holdings)
                      ListTile(
                        title: Text(h.symbol),
                        subtitle: Text(
                            '${h.quantity} @ ${Money.format(h.avgCost)}'),
                        trailing: Text(Money.format(h.marketValue)),
                        onTap: () => _showTaxEstimate(context, ref, h),
                      ),
                  ],
                ),
        ),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _import(context, ref,
                      parser: const ZerodhaXlsxParser(),
                      extensions: ['xlsx', 'xls']),
                  icon: const Icon(Icons.upload_file),
                  label: const Text('Zerodha XLSX'),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _import(context, ref,
                      parser: const UpstoxCsvParser(), extensions: ['csv']),
                  icon: const Icon(Icons.upload_file),
                  label: const Text('Upstox CSV'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _import(
    BuildContext context,
    WidgetRef ref, {
    required IBrokerParser parser,
    required List<String> extensions,
  }) async {
    final messenger = ScaffoldMessenger.of(context);
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: extensions,
      withData: true,
    );
    final bytes = picked?.files.firstOrNull?.bytes;
    if (bytes == null) return;

    try {
      final importer = ref.read(portfolioImportProvider);
      final diff = await importer.preview(parser, bytes);
      if (diff.isNoOp) {
        messenger.showSnackBar(const SnackBar(
            content: Text('Already imported — no changes.')));
        return;
      }
      if (!context.mounted) return;
      final confirmed = await _showDiff(context, diff);
      if (confirmed == true) {
        await importer.apply(diff);
        messenger.showSnackBar(SnackBar(
            content: Text(
                'Imported: ${diff.added.length} new, ${diff.changed.length} updated.')));
      }
    } on Exception catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Import failed: $e')));
    }
  }

  Future<void> _showTaxEstimate(
      BuildContext context, WidgetRef ref, Holding h) async {
    final engine = await ref.read(taxRuleEngineProvider.future);
    if (!context.mounted) return;
    final gain = engine.computeGain(
      assetType: h.assetType,
      firstPurchaseDate: h.firstPurchaseDate,
      saleDate: DateTime.now(),
      buyValue: h.investedValue,
      saleValue: h.marketValue,
    );
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${h.symbol} — capital gains'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
                'Type: ${gain.gainType == GainType.longTerm ? "Long-term" : "Short-term"}'),
            Text('Gain: ${Money.format(gain.gainAmount)}'),
            Text('Applicable rate: ${gain.rateLabel}'),
            Text('Estimated tax: ${gain.isSlab ? "—" : Money.format(gain.estimatedTax)}'),
            const SizedBox(height: AppSpacing.md),
            const Text('Estimates only. Consult a CA for tax filing.',
                style: TextStyle(fontStyle: FontStyle.italic, fontSize: 12)),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close')),
        ],
      ),
    );
  }

  Future<bool?> _showDiff(BuildContext context, PortfolioDiff diff) {
    return showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Review import'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${diff.added.length} new holdings'),
            Text('${diff.changed.length} updated'),
            Text('${diff.unchanged.length} unchanged'),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Import')),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, this.color});
  final String label;
  final Decimal value;
  final Color? color;
  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$label ${Money.toWords(value)}',
      child: ExcludeSemantics(
        child: Column(
          children: [
            Text(label, style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: AppSpacing.xs),
            Text(Money.format(value),
                style: TextStyle(fontWeight: FontWeight.bold, color: color)),
          ],
        ),
      ),
    );
  }
}
