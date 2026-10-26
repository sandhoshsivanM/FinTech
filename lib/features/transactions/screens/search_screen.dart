import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/help/info_hint.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../presentation/data_gate.dart';
import '../providers/category_providers.dart';
import '../providers/search_providers.dart';
import '../widgets/transaction_tile.dart';

class SearchScreen extends StatelessWidget {
  const SearchScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: InfoHint.titled(const Text('Search'), 'search.page'),
      ),
      body: const DataGate(child: _SearchBody()),
    );
  }
}

class _SearchBody extends ConsumerWidget {
  const _SearchBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final results = ref.watch(searchResultsProvider);
    final categories = ref.watch(categoryListProvider).valueOrNull ?? const [];
    final byId = {for (final c in categories) c.id: c};

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: TextField(
            autofocus: true,
            decoration: const InputDecoration(
              hintText: 'Search merchant, note or category',
              prefixIcon: Icon(Icons.search),
              border: OutlineInputBorder(),
            ),
            onChanged: (v) => ref.read(searchQueryProvider.notifier).state = v,
          ),
        ),
        Expanded(
          child: results.when(
            data: (txns) => txns.isEmpty
                ? const Center(child: Text('No matching transactions'))
                : ListView.separated(
                    itemCount: txns.length,
                    separatorBuilder: (context, index) =>
                        const Divider(height: 1),
                    itemBuilder: (context, i) => TransactionTile(
                      txn: txns[i],
                      category: byId[txns[i].categoryId],
                      onTap: () => context.push(Routes.editTransaction, extra: txns[i]),
                    ),
                  ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('$e')),
          ),
        ),
      ],
    );
  }
}
