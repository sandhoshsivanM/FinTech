import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/data_providers.dart';
import '../../../domain/entities/transaction.dart';

/// Current search query text.
final searchQueryProvider = StateProvider<String>((ref) => '');

/// Full-text search results for the current query (PRD §5/§16).
final searchResultsProvider = FutureProvider<List<Txn>>((ref) async {
  final query = ref.watch(searchQueryProvider).trim();
  if (query.isEmpty) return const [];
  final repo = ref.watch(transactionRepositoryProvider);
  final vaultId = ref.watch(currentVaultIdProvider);
  return repo.search(vaultId, query);
});
