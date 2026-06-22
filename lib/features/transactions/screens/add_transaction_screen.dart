import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../domain/entities/transaction.dart';
import '../../../presentation/data_gate.dart';
import '../../budget/providers/budget_providers.dart';
import '../providers/category_providers.dart';
import '../providers/quick_entry_providers.dart';
import '../providers/transaction_providers.dart';

class AddTransactionScreen extends StatelessWidget {
  const AddTransactionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add Transaction')),
      body: const DataGate(child: _AddTransactionForm()),
    );
  }
}

class _AddTransactionForm extends ConsumerStatefulWidget {
  const _AddTransactionForm();
  @override
  ConsumerState<_AddTransactionForm> createState() => _FormState();
}

class _FormState extends ConsumerState<_AddTransactionForm> {
  final _formKey = GlobalKey<FormState>();
  final _quick = TextEditingController();
  final _amount = TextEditingController();
  final _merchant = TextEditingController();
  final _note = TextEditingController();
  TxnType _type = TxnType.expense;
  String? _categoryId;
  DateTime _date = DateTime.now();

  @override
  void dispose() {
    _quick.dispose();
    _amount.dispose();
    _merchant.dispose();
    _note.dispose();
    super.dispose();
  }

  /// Parses a free-text quick entry and pre-fills the form for confirmation
  /// (PRD §14 NLP parser + merchant alias suggestion).
  Future<void> _applyQuickEntry() async {
    final text = _quick.text.trim();
    if (text.isEmpty) return;
    final categories = ref.read(categoryListProvider).valueOrNull ?? const [];
    final resolved = await ref
        .read(quickEntryResolverProvider)
        .resolve(text, categories: categories);
    final p = resolved.parsed;
    setState(() {
      if (p.amount != null) _amount.text = p.amount.toString();
      _type = p.type;
      _date = p.date;
      if (p.merchant != null) _merchant.text = p.merchant!;
      if (resolved.categoryId != null) _categoryId = resolved.categoryId;
    });
  }

  Decimal? _parseAmount(String raw) {
    try {
      final d = Decimal.parse(raw.trim());
      return d > Decimal.zero ? d : null;
    } on FormatException {
      return null;
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate() || _categoryId == null) {
      if (_categoryId == null) setState(() {});
      return;
    }
    final amount = _parseAmount(_amount.text)!;
    await ref.read(transactionListProvider.notifier).add(
          amount: amount,
          type: _type,
          categoryId: _categoryId!,
          date: _date,
          merchant: _merchant.text.trim().isEmpty ? null : _merchant.text.trim(),
          note: _note.text.trim().isEmpty ? null : _note.text.trim(),
        );
    // Learn the merchant → category association for future quick entries.
    final merchant = _merchant.text.trim();
    if (merchant.isNotEmpty && _categoryId != null) {
      await ref.read(quickEntryResolverProvider).learn(merchant, _categoryId!);
    }
    // Fire overspend alert if this expense pushed a category over threshold.
    if (_type == TxnType.expense) {
      await ref.read(budgetActionsProvider).checkAndNotify();
    }
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoryListProvider).valueOrNull ?? const [];

    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          TextField(
            controller: _quick,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _applyQuickEntry(),
            decoration: InputDecoration(
              labelText: 'Quick add',
              hintText: 'e.g. spent 450 on groceries at bigbasket',
              prefixIcon: const Icon(Icons.auto_awesome),
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                icon: const Icon(Icons.arrow_forward),
                tooltip: 'Parse quick add',
                onPressed: _applyQuickEntry,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          const Divider(),
          const SizedBox(height: AppSpacing.sm),
          SegmentedButton<TxnType>(
            segments: const [
              ButtonSegment(
                  value: TxnType.expense,
                  label: Text('Expense'),
                  icon: Icon(Icons.arrow_upward)),
              ButtonSegment(
                  value: TxnType.income,
                  label: Text('Income'),
                  icon: Icon(Icons.arrow_downward)),
            ],
            selected: {_type},
            onSelectionChanged: (s) => setState(() => _type = s.first),
          ),
          const SizedBox(height: AppSpacing.md),
          TextFormField(
            controller: _amount,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Amount (₹)',
              prefixText: '₹ ',
              border: OutlineInputBorder(),
            ),
            validator: (v) => _parseAmount(v ?? '') == null
                ? 'Enter a valid amount greater than zero'
                : null,
          ),
          const SizedBox(height: AppSpacing.md),
          DropdownButtonFormField<String>(
            initialValue: _categoryId,
            decoration: const InputDecoration(
              labelText: 'Category',
              border: OutlineInputBorder(),
            ),
            items: [
              for (final c in categories)
                DropdownMenuItem(value: c.id, child: Text(c.name)),
            ],
            onChanged: (v) => setState(() => _categoryId = v),
          ),
          if (_categoryId == null)
            const Padding(
              padding: EdgeInsets.only(top: AppSpacing.xs),
              child: _InlineError('Please select a category'),
            ),
          const SizedBox(height: AppSpacing.md),
          ListTile(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadii.button),
              side: BorderSide(color: Theme.of(context).dividerColor),
            ),
            leading: const Icon(Icons.calendar_today),
            title: Text('Date: ${DateFormat('d MMM yyyy').format(_date)}'),
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: _date,
                firstDate: DateTime(2000),
                lastDate: DateTime.now(),
              );
              if (picked != null) setState(() => _date = picked);
            },
          ),
          const SizedBox(height: AppSpacing.md),
          TextFormField(
            controller: _merchant,
            decoration: const InputDecoration(
              labelText: 'Merchant (optional)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextFormField(
            controller: _note,
            decoration: const InputDecoration(
              labelText: 'Note (optional)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          FilledButton.icon(
            onPressed: _save,
            icon: const Icon(Icons.check),
            label: const Text('Save transaction'),
          ),
        ],
      ),
    );
  }
}

/// Error = text + icon, never color alone (PRD §10A).
class _InlineError extends StatelessWidget {
  const _InlineError(this.message);
  final String message;
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(Icons.error_outline, color: AppColors.expense, size: 18),
        const SizedBox(width: AppSpacing.xs),
        Text(message, style: const TextStyle(color: AppColors.expense)),
      ],
    );
  }
}
