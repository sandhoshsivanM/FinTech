import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/di/data_providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/portfolio.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
import '../../import/lot_csv_parser.dart';
import '../providers/portfolio_providers.dart';
import '../services/lot_importer.dart';

/// Imports trades or holdings from a broker CSV.
///
/// Everything is previewed before anything is written, and rejected rows are
/// listed with the reason and line number — a silent partial import would be
/// worse than a failed one, because you would not know what was missing.
class ImportLotsScreen extends ConsumerStatefulWidget {
  const ImportLotsScreen({super.key});

  @override
  ConsumerState<ImportLotsScreen> createState() => _ImportLotsScreenState();
}

class _ImportLotsScreenState extends ConsumerState<ImportLotsScreen> {
  LotParseResult? _parsed;
  String? _fileName;
  bool _busy = false;

  bool get _datesMissing =>
      _parsed != null &&
      _parsed!.lots.isNotEmpty &&
      // A holdings snapshot has no dates; the parser then defaults to today,
      // which cannot give a correct holding period.
      _parsed!.lots.every((l) => _isToday(l.tradeDate));

  static bool _isToday(DateTime d) {
    final now = DateTime.now();
    return d.year == now.year && d.month == now.month && d.day == now.day;
  }

  Future<void> _pick() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['csv', 'txt'],
      withData: true,
    );
    final bytes = picked?.files.single.bytes;
    if (bytes == null) return;

    setState(() {
      _fileName = picked!.files.single.name;
      _parsed = const LotCsvParser().parse(bytes);
    });
  }

  Future<void> _confirm() async {
    final parsed = _parsed;
    if (parsed == null || parsed.lots.isEmpty) return;

    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final importer = LotImporter(ref.read(portfolioActionsProvider));
      final result = await importer.import(
        parsed,
        vaultId: ref.read(currentVaultIdProvider),
        datesWereMissing: _datesMissing,
      );
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(
        content: Text('Imported ${result.inserted} lot'
            '${result.inserted == 1 ? '' : 's'}'
            '${result.rejected.isEmpty ? '' : ', ${result.rejected.length} skipped'}'
            '. Re-importing the same file will not duplicate them.'),
      ));
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      messenger.showSnackBar(SnackBar(content: Text('Import failed: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final parsed = _parsed;

    return Scaffold(
      appBar: AppBar(title: const Text('Import lots')),
      body: DataGate(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Broker CSV',
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    'Works with tradebook and holdings exports. Columns are '
                    'matched by name, so the order does not matter. Parsing '
                    'happens on this device — the file is never uploaded.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color:
                            Theme.of(context).colorScheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _pick,
                    icon: const Icon(Icons.upload_file),
                    label: Text(_fileName ?? 'Choose a CSV file'),
                  ),
                ],
              ),
            ),
            if (parsed != null) ...[
              const SizedBox(height: AppSpacing.md),
              if (_datesMissing) _DateWarning(),
              if (_datesMissing) const SizedBox(height: AppSpacing.md),
              if (parsed.rejected.isNotEmpty) ...[
                _RejectedCard(rejected: parsed.rejected),
                const SizedBox(height: AppSpacing.md),
              ],
              if (parsed.lots.isEmpty)
                const GlassCard(
                  child: Text(
                    'Nothing could be read from this file. Check that it has a '
                    'header row naming a quantity column and a price column.',
                  ),
                )
              else
                _PreviewCard(lots: parsed.lots),
              const SizedBox(height: AppSpacing.lg),
              FilledButton(
                onPressed: (_busy || parsed.lots.isEmpty) ? null : _confirm,
                child: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text('Import ${parsed.lots.length} lot'
                        '${parsed.lots.length == 1 ? '' : 's'}'),
              ),
            ],
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }
}

class _DateWarning extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Row(
        children: [
          const Icon(Icons.schedule, size: 18, color: AppColors.budgetWarn),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              'This file has no trade dates, so today\'s date was used. The '
              'holding period decides short-term versus long-term tax, so these '
              'rows will be flagged for you to correct.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}

class _RejectedCard extends StatelessWidget {
  const _RejectedCard({required this.rejected});

  final List<RejectedRow> rejected;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.error_outline,
                  size: 18, color: AppColors.expense),
              const SizedBox(width: AppSpacing.sm),
              Text('${rejected.length} row'
                  '${rejected.length == 1 ? '' : 's'} skipped',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          for (final r in rejected.take(12))
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                'Line ${r.rowNumber}${r.raw == null ? '' : ' (${r.raw})'}: '
                '${r.reason}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          if (rejected.length > 12)
            Text('…and ${rejected.length - 12} more',
                style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _PreviewCard extends StatelessWidget {
  const _PreviewCard({required this.lots});

  final List<StagedLot> lots;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('${lots.length} lot${lots.length == 1 ? '' : 's'} to import',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: AppSpacing.sm),
          for (final lot in lots.take(50)) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: (lot.side == TradeSide.buy
                              ? AppColors.income
                              : AppColors.expense)
                          .withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      lot.side == TradeSide.buy ? 'BUY' : 'SELL',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: lot.side == TradeSide.buy
                            ? AppColors.income
                            : AppColors.expense,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(lot.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontWeight: FontWeight.w600)),
                        Text(
                          '${lot.quantity} @ ${Money.format(lot.pricePerUnit)}'
                          ' · ${DateFormat('d MMM y').format(lot.tradeDate)}'
                          '${lot.folioNumber == null ? '' : ' · folio ${lot.folioNumber}'}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  Text(
                    Money.format(lot.quantity * lot.pricePerUnit),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          ],
          if (lots.length > 50)
            Text('…and ${lots.length - 50} more',
                style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}
