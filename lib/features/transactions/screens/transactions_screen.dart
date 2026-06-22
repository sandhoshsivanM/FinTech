import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../domain/entities/category.dart';
import '../../../domain/entities/transaction.dart';
import '../../../presentation/data_gate.dart';
import '../providers/category_providers.dart';
import '../providers/transaction_providers.dart';
import '../widgets/transaction_tile.dart';

class TransactionsScreen extends StatelessWidget {
  const TransactionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Transactions')),
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
      TransactionData(:final transactions) => transactions.isEmpty
          ? const _EmptyState()
          : ListView.separated(
              itemCount: transactions.length,
              separatorBuilder: (context, index) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final txn = transactions[i];
                return TransactionTile(
                  txn: txn,
                  category: byId[txn.categoryId],
                  onDelete: () =>
                      ref.read(transactionListProvider.notifier).remove(txn.id),
                );
              },
            ),
    };
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.receipt_long_outlined, size: 64),
          const SizedBox(height: AppSpacing.md),
          Text('No transactions yet',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.xs),
          const Text('Tap Add to log your first one.'),
        ],
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
