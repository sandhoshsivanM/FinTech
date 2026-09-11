import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/semantic_colors.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/entities/category.dart';
import '../../../domain/entities/transaction.dart';
import '../../../presentation/data_gate.dart';
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

class _TransactionList extends ConsumerWidget {
  const _TransactionList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(transactionListProvider);
    final categories = ref.watch(categoryListProvider).valueOrNull ?? const [];
    final byId = {for (final c in categories) c.id: c};

    return switch (state) {
      TransactionLoading() => const Center(child: CircularProgressIndicator()),
      TransactionError(:final message) => Center(child: Text(message)),
      TransactionData(:final transactions) => Column(
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(
                  AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
              child: Column(
                children: [
                  ReviewQueueBanner(),
                  BudgetStrip(),
                ],
              ),
            ),
            Expanded(
              child: transactions.isEmpty
                  ? const _EmptyState()
                  : _Ledger(rows: _groupByDay(transactions), categories: byId),
            ),
          ],
        ),
    };
  }
}

class _Ledger extends ConsumerWidget {
  const _Ledger({required this.rows, required this.categories});

  final List<_Row> rows;
  final Map<String, Category> categories;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView.builder(
      padding: const EdgeInsets.only(top: AppSpacing.sm, bottom: 88),
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
          AppSpacing.md, AppSpacing.md, AppSpacing.md, AppSpacing.xs),
      child: Row(
        children: [
          Expanded(
            child: Text(
              _label(header.date),
              style: text.labelLarge?.copyWith(
                fontWeight: FontWeight.w700,
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
            Text('No transactions yet',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Tap Add to log your first one — or paste a line like '
              '"spent 450 on groceries" and it will be parsed for you.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant),
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
