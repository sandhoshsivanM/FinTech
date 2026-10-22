import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/data_providers.dart';
import 'package:khazana_domain/entities/account.dart';
import 'package:khazana_domain/entities/posting.dart';
import 'package:khazana_domain/services/account_ledger.dart';
import '../services/ledger_writer.dart';

final accountLedgerProvider = Provider<AccountLedger>(
  (ref) => const AccountLedger(),
);

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
