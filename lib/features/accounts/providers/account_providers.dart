import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/data_providers.dart';
import '../../../domain/entities/account.dart';
import '../../../domain/entities/posting.dart';
import '../../../domain/services/account_ledger.dart';
import '../../investments/providers/investment_providers.dart';
import '../services/ledger_writer.dart';

final accountLedgerProvider =
    Provider<AccountLedger>((ref) => const AccountLedger());

/// Live chart of accounts for the current vault.
final accountListProvider = StreamProvider<List<Account>>((ref) {
  return ref
      .watch(accountRepositoryProvider)
      .watch(ref.watch(currentVaultIdProvider));
});

/// Live journal postings for the current vault.
final postingListProvider = StreamProvider<List<Posting>>((ref) {
  return ref
      .watch(postingRepositoryProvider)
      .watch(ref.watch(currentVaultIdProvider));
});

/// Writes balanced postings on transaction save (single creation path).
final ledgerWriterProvider = Provider<LedgerWriter>((ref) {
  return LedgerWriter(
    accounts: ref.watch(accountRepositoryProvider),
    postings: ref.watch(postingRepositoryProvider),
    vaultId: ref.watch(currentVaultIdProvider),
  );
});

/// Net worth from the chart of accounts plus market-priced holdings.
final accountNetWorthProvider = Provider((ref) {
  final accounts = ref.watch(accountListProvider).valueOrNull ?? const [];
  final postings = ref.watch(postingListProvider).valueOrNull ?? const [];
  final holdings = ref.watch(holdingListProvider).valueOrNull ?? const [];
  return ref.watch(accountLedgerProvider).netWorth(accounts, postings, holdings);
});
