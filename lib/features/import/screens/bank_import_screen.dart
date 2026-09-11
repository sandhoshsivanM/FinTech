import 'package:decimal/decimal.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/services/bank_statement.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/empty_state.dart';
import '../../../presentation/glass_card.dart';
import '../../../presentation/stat_tile.dart';
import '../../transactions/providers/category_providers.dart';
import '../bank_parsers.dart';
import '../providers/bank_import_providers.dart';

class BankImportScreen extends StatelessWidget {
  const BankImportScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Import bank statement')),
      body: const DataGate(child: _Body()),
    );
  }
}

/// What one completed import did, kept on screen afterwards.
///
/// The result used to be a snackbar — "12 transactions imported. 3 duplicates
/// skipped." — which is the only record of a write that touches the ledger, and
/// it disappears after four seconds. Anyone who looked away had no way to find
/// out what had just happened to their books.
class ImportReport {
  const ImportReport({
    required this.bank,
    required this.imported,
    required this.duplicates,
    required this.moneyIn,
    required this.moneyOut,
    this.from,
    this.to,
  });

  final String bank;
  final int imported;
  final int duplicates;
  final Decimal moneyIn;
  final Decimal moneyOut;
  final DateTime? from;
  final DateTime? to;
}

class _Body extends ConsumerStatefulWidget {
  const _Body();
  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  SupportedBank _bank = SupportedBank.hdfc;
  BankImportPreview? _preview;
  ImportReport? _report;
  String? _fileName;
  bool _busy = false;

  Future<void> _pickAndParse() async {
    final messenger = ScaffoldMessenger.of(context);
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['csv', 'xls', 'xlsx'],
      withData: true,
    );
    final file = picked?.files.firstOrNull;
    final bytes = file?.bytes;
    if (bytes == null) return;
    setState(() {
      _busy = true;
      _report = null;
      _fileName = file?.name;
    });
    try {
      final preview =
          await ref.read(bankImportProvider).preview(_bank.parser, bytes);
      setState(() => _preview = preview);
    } on Exception catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Parse failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _commit() async {
    final preview = _preview;
    if (preview == null) return;
    final cats = ref.read(categoryListProvider).valueOrNull ?? const [];
    final fallback =
        cats.where((c) => c.name == 'Other').firstOrNull?.id ?? cats.firstOrNull?.id;
    if (fallback == null) return;

    // Totals are computed from the rows about to be written, before the commit
    // clears them — not read back afterwards, which would report whatever the
    // ledger happens to hold rather than what this run did.
    final fresh = preview.fresh;
    var moneyIn = Decimal.zero;
    var moneyOut = Decimal.zero;
    DateTime? from;
    DateTime? to;
    for (final t in fresh) {
      if (t.direction == BankTxnDirection.credit) {
        moneyIn += t.amount;
      } else {
        moneyOut += t.amount;
      }
      if (from == null || t.date.isBefore(from)) from = t.date;
      if (to == null || t.date.isAfter(to)) to = t.date;
    }

    final n = await ref.read(bankImportProvider).commit(fresh, fallback);
    if (!mounted) return;
    setState(() {
      _report = ImportReport(
        bank: _bank.label,
        imported: n,
        duplicates: preview.duplicates,
        moneyIn: moneyIn,
        moneyOut: moneyOut,
        from: from,
        to: to,
      );
      _preview = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final preview = _preview;
    final report = _report;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.md, AppSpacing.md, AppSpacing.md, AppSpacing.sm),
          child: _BankPicker(
            selected: _bank,
            // Changing bank invalidates a preview parsed with the other bank's
            // column layout. Keeping it would leave rows on screen that the
            // Import button no longer matches.
            onChanged: (b) => setState(() {
              _bank = b;
              _preview = null;
              _report = null;
            }),
          ),
        ),
        if (_busy) const LinearProgressIndicator(),
        Expanded(
          child: preview != null
              ? _Preview(preview: preview, fileName: _fileName)
              : report != null
                  ? _Report(report: report)
                  : const _Instructions(),
        ),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : _pickAndParse,
                  icon: const Icon(Icons.upload_file),
                  label: Text(
                      preview == null ? 'Choose file' : 'Choose another file'),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: FilledButton.icon(
                  onPressed: (preview?.newCount ?? 0) > 0 ? _commit : null,
                  icon: const Icon(Icons.check),
                  label: Text(preview == null
                      ? 'Import'
                      : 'Import ${preview.newCount}'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Four banks, so four chips.
///
/// This was a `DropdownButtonFormField`, which on macOS painted its menu
/// directly over the closed field — the selected label and the first menu item
/// overlapped into "HDIDFCBank". With a set this small the menu bought nothing
/// anyway: chips show every option at once and cannot mis-paint, because
/// nothing overlays anything.
class _BankPicker extends StatelessWidget {
  const _BankPicker({required this.selected, required this.onChanged});

  final SupportedBank selected;
  final ValueChanged<SupportedBank> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text('Bank',
            style: Theme.of(context)
                .textTheme
                .labelLarge
                ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            children: [
              for (final b in SupportedBank.values)
                ChoiceChip(
                  label: Text(b.label),
                  selected: b == selected,
                  onSelected: (_) => onChanged(b),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Instructions extends StatelessWidget {
  const _Instructions();

  @override
  Widget build(BuildContext context) {
    return const EmptyState(
      icon: Icons.description_outlined,
      title: 'Choose a statement to preview',
      message: 'Export a CSV or Excel statement from your bank\'s net banking, '
          'then pick it here. Khazana parses it on this device, marks rows it '
          'has already seen, and writes nothing until you press Import.',
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview({required this.preview, required this.fileName});

  final BankImportPreview preview;
  final String? fileName;

  @override
  Widget build(BuildContext context) {
    final rows = preview.staged;
    var moneyIn = Decimal.zero;
    var moneyOut = Decimal.zero;
    DateTime? from;
    DateTime? to;
    for (final t in rows.where((t) => !t.isDuplicate)) {
      if (t.direction == BankTxnDirection.credit) {
        moneyIn += t.amount;
      } else {
        moneyOut += t.amount;
      }
      if (from == null || t.date.isBefore(from)) from = t.date;
      if (to == null || t.date.isAfter(to)) to = t.date;
    }

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
      children: [
        Row(
          children: [
            Expanded(
              child: StatTile(
                label: 'To import',
                value: '${preview.newCount}',
                footer: fileName,
                emphasise: true,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: StatTile(
                label: 'Money in',
                value: Money.format(moneyIn),
                valueColor: context.colors.income,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: StatTile(
                label: 'Money out',
                value: Money.format(moneyOut),
                valueColor: context.colors.expense,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: StatTile(
                label: 'Already imported',
                value: '${preview.duplicates}',
                footer: preview.duplicates > 0 ? 'will be skipped' : null,
              ),
            ),
          ],
        ),
        if (from != null && to != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            child: Text(
              'Covering ${_date(from)} to ${_date(to)}.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
          ),
        const SizedBox(height: AppSpacing.md),
        for (final t in rows) _StagedRow(txn: t),
        const SizedBox(height: AppSpacing.md),
      ],
    );
  }
}

class _StagedRow extends StatelessWidget {
  const _StagedRow({required this.txn});

  final StagedBankTxn txn;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final credit = txn.direction == BankTxnDirection.credit;
    final tint = txn.isDuplicate
        ? muted
        : (credit ? context.colors.income : context.colors.expense);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        children: [
          Icon(
            txn.isDuplicate
                ? Icons.block
                : (credit ? Icons.arrow_downward : Icons.arrow_upward),
            size: 16,
            color: tint,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  txn.description,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text.bodyMedium?.copyWith(
                    color: txn.isDuplicate ? muted : null,
                    decoration:
                        txn.isDuplicate ? TextDecoration.lineThrough : null,
                  ),
                ),
                Text(
                  '${_date(txn.date)}'
                  '${txn.isDuplicate ? ' · already imported' : ''}',
                  style: text.bodySmall?.copyWith(color: muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            Money.format(txn.amount),
            style: text.bodyMedium
                ?.copyWith(fontWeight: FontWeight.w700, color: tint),
          ),
        ],
      ),
    );
  }
}

class _Report extends StatelessWidget {
  const _Report({required this.report});

  final ImportReport report;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
      children: [
        GlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.check_circle_outline,
                      size: 20, color: context.colors.income),
                  const SizedBox(width: AppSpacing.sm),
                  Text(
                    '${report.imported} transaction'
                    '${report.imported == 1 ? '' : 's'} imported',
                    style:
                        text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                [
                  'From your ${report.bank} statement',
                  if (report.from != null && report.to != null)
                    'covering ${_date(report.from!)} to ${_date(report.to!)}',
                ].join(', '),
                style: text.bodyMedium?.copyWith(color: muted),
              ),
              if (report.duplicates > 0)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.xs),
                  child: Text(
                    '${report.duplicates} row'
                    '${report.duplicates == 1 ? '' : 's'} already in your ledger '
                    'and skipped, so re-importing the same statement is safe.',
                    style: text.bodySmall?.copyWith(color: muted),
                  ),
                ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: StatTile(
                      label: 'Money in',
                      value: Money.format(report.moneyIn),
                      valueColor: context.colors.income,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: StatTile(
                      label: 'Money out',
                      value: Money.format(report.moneyOut),
                      valueColor: context.colors.expense,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: StatTile(
                      label: 'Net',
                      value: Money.format(report.moneyIn - report.moneyOut),
                      valueColor: report.moneyIn >= report.moneyOut
                          ? context.colors.income
                          : context.colors.expense,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Imported rows land in Cash Flow, uncategorised where Khazana '
                'could not match a merchant it has seen before.',
                style: text.bodySmall?.copyWith(color: muted),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// "4 Aug 2026". An ISO date belongs in a log, not in front of someone
/// checking their own statement.
String _date(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';
