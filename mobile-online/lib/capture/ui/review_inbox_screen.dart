import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:khazana_domain/entities/transaction.dart' show TxnType;

import '../capture_draft.dart';
import '../capture_sink.dart';

/// Drafts waiting for the user: approve, edit then approve, or reject. Balances
/// are never touched from here; approval hands the draft on to the ledger.
class ReviewInboxScreen extends StatefulWidget {
  const ReviewInboxScreen({super.key, required this.sink});
  final CaptureSink sink;

  @override
  State<ReviewInboxScreen> createState() => _ReviewInboxScreenState();
}

class _ReviewInboxScreenState extends State<ReviewInboxScreen> {
  late Future<List<CaptureDraft>> _drafts = _load();

  Future<List<CaptureDraft>> _load() async =>
      [for (final d in await widget.sink.all()) if (d.status == DraftStatus.pending) d];

  void _reload() {
    final next = _load();
    setState(() {
      _drafts = next;
    });
  }

  Future<void> _decide(CaptureDraft d, DraftStatus s, {CaptureDraft? edited}) async {
    await widget.sink.decide(d.id, s, edited: edited);
    _reload();
  }

  Future<void> _edit(CaptureDraft d) async {
    final edited = await showDialog<CaptureDraft>(context: context, builder: (_) => _EditDialog(draft: d));
    if (edited != null) await _decide(d, DraftStatus.approved, edited: edited);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Review inbox')),
      body: FutureBuilder<List<CaptureDraft>>(
        future: _drafts,
        builder: (context, snap) {
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final drafts = snap.data!;
          if (drafts.isEmpty) {
            return const Center(
              key: Key('inbox-empty'),
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text('Nothing to review. Captured transactions wait here until you approve them.',
                    textAlign: TextAlign.center),
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: drafts.length,
            itemBuilder: (_, i) => _DraftCard(
              draft: drafts[i],
              onApprove: () => _decide(drafts[i], DraftStatus.approved),
              onEdit: () => _edit(drafts[i]),
              onReject: () => _decide(drafts[i], DraftStatus.rejected),
            ),
          );
        },
      ),
    );
  }
}

String sourceLabel(DraftSource s) => switch (s) {
      DraftSource.gmail => 'Gmail',
      DraftSource.ocr => 'Screenshot',
      DraftSource.shortcut => 'iPhone Shortcut',
    };

class _DraftCard extends StatelessWidget {
  const _DraftCard({required this.draft, required this.onApprove, required this.onEdit, required this.onReject});
  final CaptureDraft draft;
  final VoidCallback onApprove, onEdit, onReject;

  @override
  Widget build(BuildContext context) {
    final out = draft.type == TxnType.expense;
    final merchant = draft.merchant.isEmpty ? 'Unknown merchant' : draft.merchant;
    final acct = draft.accountLast4 == null ? '' : '  ••${draft.accountLast4}';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(merchant, style: Theme.of(context).textTheme.titleMedium)),
            Text('${out ? '-' : '+'}₹${draft.amount}', style: Theme.of(context).textTheme.titleMedium),
          ]),
          const SizedBox(height: 4),
          Text('${draft.date}  ·  ${sourceLabel(draft.source)}$acct',
              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: 8),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            TextButton(onPressed: onReject, child: const Text('Reject')),
            TextButton(onPressed: onEdit, child: const Text('Edit')),
            FilledButton(onPressed: onApprove, child: const Text('Approve')),
          ]),
        ]),
      ),
    );
  }
}

class _EditDialog extends StatefulWidget {
  const _EditDialog({required this.draft});
  final CaptureDraft draft;

  @override
  State<_EditDialog> createState() => _EditDialogState();
}

class _EditDialogState extends State<_EditDialog> {
  late final _amount = TextEditingController(text: widget.draft.amount.toString());
  late final _merchant = TextEditingController(text: widget.draft.merchant);
  late final _date = TextEditingController(text: widget.draft.date);
  late TxnType _type = widget.draft.type;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _merchant.dispose();
    _date.dispose();
    super.dispose();
  }

  void _save() {
    final amount = Decimal.tryParse(_amount.text.trim());
    final date = DateTime.tryParse(_date.text.trim());
    if (amount == null || amount <= Decimal.zero) return setState(() => _error = 'Enter an amount above zero.');
    if (date == null || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(_date.text.trim())) {
      return setState(() => _error = 'Use the date format YYYY-MM-DD.');
    }
    Navigator.pop(
      context,
      widget.draft.copyWith(amount: amount, type: _type, merchant: _merchant.text.trim(), date: _date.text.trim()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Edit and approve'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          SegmentedButton<TxnType>(
            segments: const [
              ButtonSegment(value: TxnType.expense, label: Text('Spent')),
              ButtonSegment(value: TxnType.income, label: Text('Received')),
            ],
            selected: {_type},
            onSelectionChanged: (s) => setState(() => _type = s.first),
          ),
          TextField(
              key: const Key('edit-amount'),
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Amount (₹)')),
          TextField(key: const Key('edit-merchant'), controller: _merchant, decoration: const InputDecoration(labelText: 'Merchant')),
          TextField(key: const Key('edit-date'), controller: _date, decoration: const InputDecoration(labelText: 'Date (YYYY-MM-DD)')),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(key: const Key('edit-save'), onPressed: _save, child: const Text('Approve')),
      ],
    );
  }
}
