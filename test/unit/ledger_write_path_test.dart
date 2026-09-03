import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Source-level guard for the defect class behind APP-INVENTORY §7.7.
///
/// Every transaction write must go through `DriftTransactionRepository`, because
/// that is the only path the callers pair with `LedgerWriter.writeEntry`. When
/// `recurring_providers` and `bank_import_providers` called `transactionDao`
/// directly they produced rows with no postings: importing a statement left the
/// Accounts screen and net worth untouched, which reads to a user as an import
/// that silently did nothing.
///
/// The bug is invisible to a unit test of either side — the DAO write is
/// correct, and LedgerWriter is correct. Only the *absence of the call* is
/// wrong, so this asserts on the shape of the source instead.
void main() {
  test('nothing outside the DI wiring touches transactionDao directly', () {
    // The one legitimate reference: constructing the repository.
    const allowed = 'lib/core/di/data_providers.dart';

    final offenders = <String>[];
    for (final entity in Directory('lib').listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      if (entity.path.endsWith('.g.dart')) continue;
      final relative = entity.path.replaceAll(r'\', '/');
      if (relative == allowed) continue;
      if (entity.readAsStringSync().contains('transactionDao')) {
        offenders.add(relative);
      }
    }

    expect(
      offenders,
      isEmpty,
      reason: 'These files write transactions without going through '
          'DriftTransactionRepository, so their rows will have no double-entry '
          'postings. Use transactionRepositoryProvider and follow the save with '
          'LedgerWriter.writeEntry — see TransactionNotifier.add.',
    );
  });
}
