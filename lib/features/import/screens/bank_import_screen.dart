import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/services/bank_statement.dart';
import '../../../presentation/data_gate.dart';
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

class _Body extends ConsumerStatefulWidget {
  const _Body();
  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  SupportedBank _bank = SupportedBank.hdfc;
  BankImportPreview? _preview;
  bool _busy = false;

  Future<void> _pickAndParse() async {
    final messenger = ScaffoldMessenger.of(context);
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['csv', 'xls', 'xlsx'],
      withData: true,
    );
    final bytes = picked?.files.firstOrNull?.bytes;
    if (bytes == null) return;
    setState(() => _busy = true);
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
    final fallback = cats
            .where((c) => c.name == 'Other')
            .firstOrNull
            ?.id ??
        cats.firstOrNull?.id;
    if (fallback == null) return;
    final messenger = ScaffoldMessenger.of(context);
    final n = await ref.read(bankImportProvider).commit(preview.fresh, fallback);
    messenger.showSnackBar(SnackBar(
        content: Text(
            '$n transactions imported. ${preview.duplicates} duplicates skipped.')));
    if (mounted) setState(() => _preview = null);
  }

  @override
  Widget build(BuildContext context) {
    final preview = _preview;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: DropdownButtonFormField<SupportedBank>(
            initialValue: _bank,
            decoration: const InputDecoration(
                labelText: 'Bank', border: OutlineInputBorder()),
            items: [
              for (final b in SupportedBank.values)
                DropdownMenuItem(value: b, child: Text(b.label)),
            ],
            onChanged: (v) => setState(() => _bank = v ?? _bank),
          ),
        ),
        if (_busy) const LinearProgressIndicator(),
        if (preview != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                Text('${preview.staged.length} parsed'),
                Text('${preview.newCount} new'),
                Text('${preview.duplicates} duplicates'),
              ],
            ),
          ),
        Expanded(
          child: preview == null
              ? const Center(child: Text('Pick a statement file to preview.'))
              : ListView(
                  children: [
                    for (final t in preview.staged)
                      ListTile(
                        leading: Icon(
                          t.isDuplicate
                              ? Icons.block
                              : (t.direction == BankTxnDirection.credit
                                  ? Icons.arrow_downward
                                  : Icons.arrow_upward),
                          color: t.isDuplicate ? Colors.grey : null,
                        ),
                        title: Text(
                          t.description,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              decoration: t.isDuplicate
                                  ? TextDecoration.lineThrough
                                  : null),
                        ),
                        subtitle: Text(
                            '${t.date.toIso8601String().substring(0, 10)}'
                            '${t.isDuplicate ? ' · already imported' : ''}'),
                        trailing: Text(Money.format(t.amount)),
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
                  onPressed: _busy ? null : _pickAndParse,
                  icon: const Icon(Icons.upload_file),
                  label: const Text('Choose file'),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: FilledButton.icon(
                  onPressed: (preview?.newCount ?? 0) > 0 ? _commit : null,
                  icon: const Icon(Icons.check),
                  label: Text('Import ${preview?.newCount ?? 0}'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
