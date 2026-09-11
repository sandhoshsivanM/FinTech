import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/category_icons.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../domain/entities/transaction.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
import '../../attachments/providers/attachment_providers.dart';
import '../../budget/providers/budget_providers.dart';
import '../providers/category_providers.dart';
import '../providers/quick_entry_providers.dart';
import '../providers/transaction_providers.dart';

// ---------------------------------------------------------------------------
// Screen root
// ---------------------------------------------------------------------------

class AddTransactionScreen extends StatelessWidget {
  const AddTransactionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text('Add Transaction'),
      ),
      body: const SafeArea(child: DataGate(child: _AddTransactionForm())),
    );
  }
}

// ---------------------------------------------------------------------------
// Form (all original wiring preserved)
// ---------------------------------------------------------------------------

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
  bool _showCategoryError = false;
  String? _attachmentRef;
  bool _attaching = false;

  @override
  void dispose() {
    _quick.dispose();
    _amount.dispose();
    _merchant.dispose();
    _note.dispose();
    super.dispose();
  }

  // ------------------------------------------------------------------
  // Quick-entry NLP parse + merchant alias resolution (PRD §14)
  // ------------------------------------------------------------------

  Future<void> _applyQuickEntry() async {
    final text = _quick.text.trim();
    if (text.isEmpty) return;
    final categories =
        ref.read(categoryListProvider).valueOrNull ?? const [];
    final resolved = await ref
        .read(quickEntryResolverProvider)
        .resolve(text, categories: categories);
    final p = resolved.parsed;
    setState(() {
      if (p.amount != null) _amount.text = p.amount.toString();
      _type = p.type;
      _date = p.date;
      if (p.merchant != null) _merchant.text = p.merchant!;
      if (resolved.categoryId != null) {
        _categoryId = resolved.categoryId;
        _showCategoryError = false;
      }
    });
  }

  // ------------------------------------------------------------------
  // Amount parsing (Decimal — no double arithmetic)
  // ------------------------------------------------------------------

  Decimal? _parseAmount(String raw) {
    final d = Decimal.tryParse(raw.trim());
    return (d != null && d > Decimal.zero) ? d : null;
  }

  // ------------------------------------------------------------------
  // Save: validate → add → learn alias → check budget → pop
  // ------------------------------------------------------------------

  Future<void> _save() async {
    setState(() => _showCategoryError = _categoryId == null);
    if (!_formKey.currentState!.validate() || _categoryId == null) return;

    final amount = _parseAmount(_amount.text)!;
    final categories =
        ref.read(categoryListProvider).valueOrNull ?? const [];
    String? categoryName;
    for (final c in categories) {
      if (c.id == _categoryId) {
        categoryName = c.name;
        break;
      }
    }
    await ref.read(transactionListProvider.notifier).add(
          amount: amount,
          type: _type,
          categoryId: _categoryId!,
          date: _date,
          merchant:
              _merchant.text.trim().isEmpty ? null : _merchant.text.trim(),
          note: _note.text.trim().isEmpty ? null : _note.text.trim(),
          categoryName: categoryName,
          attachmentRef: _attachmentRef,
        );

    // Learn merchant → category association for future quick entries.
    final merchant = _merchant.text.trim();
    if (merchant.isNotEmpty && _categoryId != null) {
      await ref
          .read(quickEntryResolverProvider)
          .learn(merchant, _categoryId!);
    }

    // Fire overspend alert if this expense pushed a category over threshold.
    if (_type == TxnType.expense) {
      await ref.read(budgetActionsProvider).checkAndNotify();
    }

    if (mounted) context.pop();
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  Future<void> _pickAttachment() async {
    setState(() => _attaching = true);
    try {
      final rel = await ref.read(attachmentServiceProvider).pickAndStore();
      if (rel != null && mounted) setState(() => _attachmentRef = rel);
    } finally {
      if (mounted) setState(() => _attaching = false);
    }
  }

  bool get _isExpense => _type == TxnType.expense;
  String get _dateLabel {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final d = DateTime(_date.year, _date.month, _date.day);
    if (d == today) return 'Today, ${DateFormat('d MMM yyyy').format(_date)}';
    return DateFormat('d MMM yyyy').format(_date);
  }

  // ------------------------------------------------------------------
  // Build
  // ------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final categories =
        ref.watch(categoryListProvider).valueOrNull ?? const [];

    // Expense segment: red-tinted when selected; Income: green.
    final typeColor =
        _isExpense ? context.colors.expense : context.colors.income;

    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        children: [
          // ── Quick add NLP field ────────────────────────────────────
          GlassCard(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md, vertical: AppSpacing.sm),
            child: TextField(
              controller: _quick,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _applyQuickEntry(),
              style: Theme.of(context).textTheme.bodyMedium,
              decoration: InputDecoration(
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                hintText: 'Try: spent 450 on groceries at bigbasket',
                hintStyle: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(
                        color:
                            Theme.of(context).colorScheme.onSurfaceVariant),
                prefixIcon: Icon(Icons.auto_awesome,
                    size: 18, color: context.colors.accentGlow),
                suffixIcon: Semantics(
                  button: true,
                  label: 'Parse quick add',
                  child: ExcludeSemantics(
                    child: IconButton(
                      icon: Icon(Icons.arrow_forward,
                          size: 18, color: context.colors.accentGlow),
                      tooltip: 'Parse quick add',
                      onPressed: _applyQuickEntry,
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          // ── Expense / Income selector ─────────────────────────────
          _TypeSelector(
            selected: _type,
            onChanged: (t) => setState(() => _type = t),
          ),
          const SizedBox(height: AppSpacing.lg),

          // ── Big amount display ─────────────────────────────────────
          _AmountDisplay(
            controller: _amount,
            typeColor: typeColor,
            formKey: _formKey,
            parseAmount: _parseAmount,
          ),
          const SizedBox(height: AppSpacing.sm),

          // ── Date chip ─────────────────────────────────────────────
          Center(
            child: Semantics(
              button: true,
              label: 'Transaction date: $_dateLabel',
              child: InkWell(
                borderRadius: BorderRadius.circular(AppRadii.pill),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _date,
                    firstDate: DateTime(2000),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) setState(() => _date = picked);
                },
                child: ExcludeSemantics(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md, vertical: AppSpacing.sm),
                    decoration: BoxDecoration(
                      color: context.colors.accent.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                      border: Border.all(
                          color: context.colors.accent.withValues(alpha: 0.20)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.calendar_today,
                            size: 14, color: context.colors.accentGlow),
                        const SizedBox(width: AppSpacing.xs),
                        Text(
                          _dateLabel,
                          style: TextStyle(
                            color: context.colors.accentGlow,
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          // ── Category grid ─────────────────────────────────────────
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Select Category',
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: AppSpacing.md),
                if (categories.isEmpty)
                  const Center(child: CircularProgressIndicator())
                else
                  _CategoryGrid(
                    categories: categories,
                    selected: _categoryId,
                    onSelect: (id) => setState(() {
                      _categoryId = id;
                      _showCategoryError = false;
                    }),
                  ),
                if (_showCategoryError) ...[
                  const SizedBox(height: AppSpacing.sm),
                  const _InlineError('Please select a category'),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          // ── Note (optional) ───────────────────────────────────────
          TextFormField(
            controller: _note,
            decoration: const InputDecoration(
              labelText: 'Note (optional)',
              prefixIcon: Icon(Icons.notes_outlined),
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          // ── Receipt attachment (optional, stored locally) ─────────
          if (_attachmentRef == null)
            OutlinedButton.icon(
              onPressed: _attaching ? null : _pickAttachment,
              icon: _attaching
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.attach_file),
              label: const Text('Attach receipt'),
            )
          else
            Row(
              children: [
                Icon(Icons.receipt_long, color: context.colors.accentGlow),
                const SizedBox(width: AppSpacing.sm),
                const Expanded(child: Text('Receipt attached')),
                IconButton(
                  tooltip: 'Remove receipt',
                  icon: const Icon(Icons.close),
                  onPressed: () => setState(() => _attachmentRef = null),
                ),
              ],
            ),
          const SizedBox(height: AppSpacing.lg),

          // ── Save button ───────────────────────────────────────────
          SizedBox(
            width: double.infinity,
            height: AppSpacing.minTouchTarget,
            child: FilledButton.icon(
              onPressed: _save,
              icon: const Icon(Icons.check),
              label: const Text('Save Transaction'),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Expense / Income segmented selector with semantic colors
// ---------------------------------------------------------------------------

class _TypeSelector extends StatelessWidget {
  const _TypeSelector({required this.selected, required this.onChanged});

  final TxnType selected;
  final ValueChanged<TxnType> onChanged;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<TxnType>(
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (!states.contains(WidgetState.selected)) {
            return Colors.transparent;
          }
          // Expense selected → red tint; Income selected → green tint.
          return selected == TxnType.expense
              ? context.colors.expense.withValues(alpha: 0.18)
              : context.colors.income.withValues(alpha: 0.18);
        }),
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (!states.contains(WidgetState.selected)) {
            return Theme.of(context).colorScheme.onSurfaceVariant;
          }
          return selected == TxnType.expense
              ? context.colors.expense
              : context.colors.income;
        }),
      ),
      segments: const [
        ButtonSegment(
          value: TxnType.expense,
          label: Text('Expense'),
          icon: Icon(Icons.arrow_upward_rounded),
        ),
        ButtonSegment(
          value: TxnType.income,
          label: Text('Income'),
          icon: Icon(Icons.arrow_downward_rounded),
        ),
      ],
      selected: {selected},
      onSelectionChanged: (s) => onChanged(s.first),
    );
  }
}

// ---------------------------------------------------------------------------
// Big centered amount field
// ---------------------------------------------------------------------------

class _AmountDisplay extends StatelessWidget {
  const _AmountDisplay({
    required this.controller,
    required this.typeColor,
    required this.formKey,
    required this.parseAmount,
  });

  final TextEditingController controller;
  final Color typeColor;
  final GlobalKey<FormState> formKey;
  final Decimal? Function(String) parseAmount;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Semantics(
        label: 'Amount in rupees',
        child: SizedBox(
          width: 260,
          child: TextFormField(
            controller: controller,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 40,
              fontWeight: FontWeight.w800,
              color: typeColor,
              height: 1.1,
            ),
            decoration: InputDecoration(
              filled: false,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              errorBorder: InputBorder.none,
              focusedErrorBorder: InputBorder.none,
              hintText: '₹0',
              hintStyle: TextStyle(
                fontSize: 40,
                fontWeight: FontWeight.w800,
                color: typeColor.withValues(alpha: 0.30),
                height: 1.1,
              ),
              prefixText: '₹',
              prefixStyle: TextStyle(
                fontSize: 40,
                fontWeight: FontWeight.w800,
                color: typeColor,
                height: 1.1,
              ),
              errorStyle: const TextStyle(fontSize: 0, height: 0),
            ),
            validator: (v) =>
                parseAmount(v ?? '') == null ? '' : null,
            onChanged: (_) {
              // Trigger rebuild for live mirror (form validates on save only).
            },
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Category tile grid
// ---------------------------------------------------------------------------

class _CategoryGrid extends StatelessWidget {
  const _CategoryGrid({
    required this.categories,
    required this.selected,
    required this.onSelect,
  });

  final List<dynamic> categories; // List<Category>
  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        for (final c in categories)
          _CategoryTile(
            id: c.id as String,
            name: c.name as String,
            iconCodepoint: c.iconCodepoint as int?,
            isSelected: c.id == selected,
            onTap: () => onSelect(c.id as String),
          ),
      ],
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.id,
    required this.name,
    required this.isSelected,
    required this.onTap,
    this.iconCodepoint,
  });

  final String id;
  final String name;
  final int? iconCodepoint;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final iconData =
        categoryIcon(iconCodepoint, fallback: Icons.label_outline);

    final bg = isSelected
        ? context.colors.accent.withValues(alpha: 0.18)
        : AppColors.glassFillDark.withValues(alpha: 0.06);
    final borderColor = isSelected
        ? context.colors.accent
        : AppColors.glassBorderDark;
    final iconColor = isSelected ? context.colors.accentGlow : Colors.grey;
    final textColor = isSelected
        ? context.colors.accentGlow
        : Theme.of(context).colorScheme.onSurfaceVariant;

    // Width: 4 tiles per row accounting for 3 gaps of 8dp each.
    return LayoutBuilder(builder: (context, _) {
      const tileWidth = 72.0;
      return Semantics(
        button: true,
        selected: isSelected,
        label: name,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadii.button),
          child: ExcludeSemantics(
            child: Container(
              width: tileWidth,
              padding: const EdgeInsets.symmetric(
                  vertical: AppSpacing.sm, horizontal: AppSpacing.xs),
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(AppRadii.button),
                border: Border.all(color: borderColor),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(iconData, color: iconColor, size: 22),
                  const SizedBox(height: 4),
                  Text(
                    name,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: isSelected
                          ? FontWeight.w700
                          : FontWeight.w500,
                      color: textColor,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Inline error — text + icon, never color alone (PRD §10A)
// ---------------------------------------------------------------------------

class _InlineError extends StatelessWidget {
  const _InlineError(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(Icons.error_outline, color: context.colors.expense, size: 16),
        const SizedBox(width: AppSpacing.xs),
        Text(message,
            style: TextStyle(color: context.colors.expense, fontSize: 12)),
      ],
    );
  }
}
