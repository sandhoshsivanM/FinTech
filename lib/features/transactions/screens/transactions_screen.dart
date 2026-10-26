import '../../../core/help/info_hint.dart';
import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../core/di/data_providers.dart';
import 'package:khazana_domain/entities/account.dart';
import 'package:khazana_domain/entities/category.dart';
import 'package:khazana_domain/entities/transaction.dart';
import '../../../presentation/data_gate.dart';
import '../../accounts/providers/account_providers.dart';
import '../../accounts/services/ledger_writer.dart';
import '../providers/category_providers.dart';
import '../providers/transaction_providers.dart';
import '../widgets/budget_strip.dart';
import '../widgets/review_queue_banner.dart';
import '../widgets/transaction_tile.dart';

class TransactionsScreen extends StatelessWidget {
  const TransactionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: const DataGate(child: _TransactionList()),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.go(Routes.addTransaction),
        icon: const Icon(Icons.add),
        label: const Text('Add'),
        tooltip: 'Add transaction',
      ),
    );
  }
}

/// One row of the ledger: either a day header or a transaction.
///
/// Flattened into a single list rather than nested per-day widgets so the whole
/// thing stays a `ListView.builder` — a vault with a few thousand transactions
/// should not build every row to scroll the first screen.
sealed class _Row {
  const _Row();
}

class _DayHeader extends _Row {
  const _DayHeader(this.date, this.net);
  final DateTime date;

  /// Income minus expense for the day. Shown because a date alone answers
  /// nothing, and the running shape of a week is the reason to group at all.
  final Decimal net;
}

class _TxnRow extends _Row {
  const _TxnRow(this.txn);
  final Txn txn;
}

List<_Row> _groupByDay(List<Txn> txns) {
  final sorted = [...txns]..sort((a, b) => b.date.compareTo(a.date));
  final rows = <_Row>[];
  DateTime? currentDay;
  var dayStart = 0;

  DateTime dayOf(DateTime d) => DateTime(d.year, d.month, d.day);

  void closeDay() {
    if (currentDay == null) return;
    var net = Decimal.zero;
    for (var i = dayStart; i < rows.length; i++) {
      final r = rows[i];
      if (r is _TxnRow) {
        net += r.txn.type == TxnType.income ? r.txn.amount : -r.txn.amount;
      }
    }
    rows[dayStart - 1] = _DayHeader(currentDay, net);
  }

  for (final t in sorted) {
    final day = dayOf(t.date);
    if (currentDay == null || day != currentDay) {
      closeDay();
      currentDay = day;
      // Placeholder; the net is only known once the day's rows are in.
      rows.add(_DayHeader(day, Decimal.zero));
      dayStart = rows.length;
    }
    rows.add(_TxnRow(t));
  }
  closeDay();
  return rows;
}

/// Which transactions the ledger shows. Null fields mean "all".
class TxnFilter {
  const TxnFilter({this.type, this.categoryId, this.accountId});
  final TxnType? type;
  final String? categoryId;
  final String? accountId;

  bool get active => type != null || categoryId != null || accountId != null;

  /// [cashId] is the default cash account: entries with no account of their
  /// own live there, so filtering on Cash must include them.
  bool matches(Txn t, String cashId) {
    if (type != null && t.type != type) return false;
    if (categoryId != null && t.categoryId != categoryId) return false;
    if (accountId != null && (t.accountId ?? cashId) != accountId) {
      return false;
    }
    return true;
  }
}

final txnFilterProvider = StateProvider.autoDispose<TxnFilter>(
  (ref) => const TxnFilter(),
);

class _FilterBar extends ConsumerWidget {
  const _FilterBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final f = ref.watch(txnFilterProvider);
    final categories = [
      ...(ref.watch(categoryListProvider).valueOrNull ?? const <Category>[]),
    ]..sort((a, b) => a.name.compareTo(b.name));
    final accounts = [
      ...(ref.watch(accountListProvider).valueOrNull ?? const <Account>[])
          .where((a) =>
              !a.archived &&
              (a.subtype == 'bank' ||
                  a.subtype == 'cash' ||
                  a.subtype == 'credit_card')),
    ]..sort((a, b) => a.name.compareTo(b.name));
    void set(TxnFilter n) => ref.read(txnFilterProvider.notifier).state = n;

    Widget dropdown(String label, String? value,
        List<DropdownMenuItem<String?>> items, void Function(String?) on) {
      return Expanded(
        child: DropdownButtonFormField<String?>(
          key: ValueKey('$label-$value'),
          initialValue: value,
          isExpanded: true,
          decoration: InputDecoration(
            labelText: label,
            isDense: true,
            border: const OutlineInputBorder(),
          ),
          items: [DropdownMenuItem<String?>(value: null, child: const Text('All')), ...items],
          onChanged: on,
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
      child: Column(
        children: [
          SegmentedButton<TxnType?>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: null, label: Text('All')),
              ButtonSegment(value: TxnType.income, label: Text('Income')),
              ButtonSegment(value: TxnType.expense, label: Text('Expense')),
            ],
            selected: {f.type},
            onSelectionChanged: (s) => set(TxnFilter(
                type: s.first,
                categoryId: f.categoryId,
                accountId: f.accountId)),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              dropdown(
                'Category',
                categories.any((c) => c.id == f.categoryId) ? f.categoryId : null,
                [
                  for (final c in categories)
                    DropdownMenuItem<String?>(value: c.id, child: Text(c.name)),
                ],
                (v) => set(TxnFilter(
                    type: f.type, categoryId: v, accountId: f.accountId)),
              ),
              const SizedBox(width: AppSpacing.sm),
              dropdown(
                'Account',
                accounts.any((a) => a.id == f.accountId) ? f.accountId : null,
                [
                  for (final a in accounts)
                    DropdownMenuItem<String?>(value: a.id, child: Text(a.name)),
                ],
                (v) => set(TxnFilter(
                    type: f.type, categoryId: f.categoryId, accountId: v)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TransactionList extends ConsumerWidget {
  const _TransactionList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(transactionListProvider);
    final categories = ref.watch(categoryListProvider).valueOrNull ?? const [];
    final byId = {for (final c in categories) c.id: c};
    final filter = ref.watch(txnFilterProvider);
    final cashId = LedgerWriter.cashId(ref.watch(currentVaultIdProvider));

    return switch (state) {
      TransactionLoading() => const Center(child: CircularProgressIndicator()),
      TransactionError(:final message) => Center(child: Text(message)),
      TransactionData(:final transactions) => Column(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: const EdgeInsets.only(left: AppSpacing.lg),
              child: InfoHint.titled(
                Text(
                  'Cash flow',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                ),
                'transactions.page',
              ),
            ),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.sm,
              AppSpacing.md,
              0,
            ),
            child: Column(children: [ReviewQueueBanner(), BudgetStrip()]),
          ),
          if (transactions.isNotEmpty) const _FilterBar(),
          Expanded(
            child: transactions.isEmpty
                ? const _EmptyState()
                : _filtered(transactions, filter, cashId).isEmpty
                    ? const _NoMatches()
                    : _Ledger(
                        rows: _groupByDay(
                            _filtered(transactions, filter, cashId)),
                        categories: byId),
          ),
        ],
      ),
    };
  }
}

List<Txn> _filtered(List<Txn> all, TxnFilter f, String cashId) =>
    f.active ? [for (final t in all) if (f.matches(t, cashId)) t] : all;

class _NoMatches extends ConsumerWidget {
  const _NoMatches();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('No transactions match these filters.'),
          TextButton(
            onPressed: () =>
                ref.read(txnFilterProvider.notifier).state = const TxnFilter(),
            child: const Text('Clear filters'),
          ),
        ],
      ),
    );
  }
}

class _Ledger extends ConsumerWidget {
  const _Ledger({required this.rows, required this.categories});

  final List<_Row> rows;
  final Map<String, Category> categories;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView.builder(
      padding: const EdgeInsets.only(top: AppSpacing.sm, bottom: 128),
      itemCount: rows.length,
      itemBuilder: (context, i) {
        final row = rows[i];
        return switch (row) {
          _DayHeader() => _DayHeaderTile(header: row),
          _TxnRow(:final txn) => TransactionTile(
            txn: txn,
            category: categories[txn.categoryId],
            onDelete: () =>
                ref.read(transactionListProvider.notifier).remove(txn.id),
            onTap: () => context.push(Routes.editTransaction, extra: txn),
          ),
        };
      },
    );
  }
}

class _DayHeaderTile extends StatelessWidget {
  const _DayHeaderTile({required this.header});
  final _DayHeader header;

  static String _label(DateTime day) {
    final today = DateTime.now();
    final start = DateTime(today.year, today.month, today.day);
    final diff = start.difference(day).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    // Within the week, the weekday is easier to place than a date.
    if (diff < 7) return DateFormat('EEEE').format(day);
    return DateFormat('d MMM yyyy').format(day);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final positive = header.net > Decimal.zero;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.md,
        AppSpacing.md,
        AppSpacing.xs,
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              _label(header.date),
              style: text.labelLarge?.copyWith(
                fontWeight: FontWeight.w500,
                color: scheme.onSurfaceVariant,
              ),
            ),
          ),
          Text(
            '${positive ? '+' : ''}${Money.format(header.net)}',
            style: text.labelMedium?.copyWith(
              color: positive ? context.colors.income : scheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.receipt_long_outlined, size: 64),
            const SizedBox(height: AppSpacing.md),
            Text(
              'No transactions yet',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Tap Add to log your first one — or paste a line like '
              '"spent 450 on groceries" and it will be parsed for you.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shared date formatter for transaction rows.
String formatTxnDate(DateTime d) => DateFormat('d MMM yyyy').format(d);

/// Resolve a category name for display (used by tiles/tests).
String categoryName(Category? c) => c?.name ?? 'Uncategorized';

/// Sign helper.
bool isIncome(Txn t) => t.type == TxnType.income;
