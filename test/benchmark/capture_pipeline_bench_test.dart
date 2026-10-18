@Tags(['benchmark'])
library;

import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_merchant_alias_repository.dart';
import 'package:khazana/data/repositories/drift_pending_capture_repository.dart';
import 'package:khazana/data/repositories/drift_transaction_repository.dart';
import 'package:khazana/domain/entities/pending_capture.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/domain/services/notification_parser.dart';
import 'package:khazana/features/capture/services/capture_channel.dart';
import 'package:khazana/features/capture/services/capture_pipeline.dart';

class _NoopPoster implements CapturePoster {
  @override
  Future<String> post({required Decimal amount, required TxnType type, required String categoryId,
      required DateTime date, String? merchant, String? accountId, required String source,
      required String captureId}) async => 'txn';
  @override
  Future<void> remove(String txnId) async {}
}

/// Measured numbers for a 90-day SMS history import, the heaviest thing the
/// capture path does. Loose bounds only — these print figures, they are not
/// gates on a particular machine. Run with:
///   flutter test test/benchmark/capture_pipeline_bench_test.dart
void main() {
  // A busy 90 days: ~22 bank alerts a day, each with its own reference and a
  // running balance, so nothing collapses as a duplicate.
  final start = DateTime(2025, 10, 1, 9);
  final messages = [
    for (var i = 0; i < 2000; i++)
      CapturedMessage(
        text: 'Rs ${100 + i % 900}.00 debited from a/c XX1234 at MERCHANT${i % 40} '
            'on ${start.add(Duration(minutes: 65 * i)).day.toString().padLeft(2, '0')}-'
            '${start.add(Duration(minutes: 65 * i)).month.toString().padLeft(2, '0')}-25. '
            'UPI Ref ${(400000000000 + i)}. Avl Bal Rs ${1000000 - i * 300}.00',
        sender: 'VM-HDFCBK',
        source: CaptureSource.sms,
        postedAt: start.add(Duration(minutes: 65 * i)),
      ),
  ];

  test('parser: 2,000 alerts', () {
    const parser = NotificationParser();
    final sw = Stopwatch()..start();
    var parsed = 0;
    for (final m in messages) {
      if (parser.parse(m.text, now: m.postedAt, sender: m.sender) != null) parsed++;
    }
    sw.stop();
    // ignore: avoid_print
    print('parser: $parsed/2000 parsed in ${sw.elapsedMilliseconds} ms '
        '(${(sw.elapsedMicroseconds / 2000).toStringAsFixed(1)} µs each)');
    expect(parsed, 2000);
    expect(sw.elapsedMilliseconds, lessThan(5000));
  });

  test('pipeline: 2,000-alert history import into an in-memory vault', () async {
    final db = AppDatabase(NativeDatabase.memory());
    final pipeline = CapturePipeline(
      repo: DriftPendingCaptureRepository(db.pendingCaptureDao),
      links: DriftCaptureAccountLinkRepository(db.pendingCaptureDao),
      aliases: DriftMerchantAliasRepository(db.merchantAliasDao),
      transactions: DriftTransactionRepository(db.transactionDao),
      poster: _NoopPoster(),
      vaultId: 'v1',
    );
    final sw = Stopwatch()..start();
    final outcomes = await pipeline.ingestAll(messages);
    sw.stop();
    final queued = outcomes.where((o) => o.result == IngestResult.queued).length;
    // ignore: avoid_print
    print('pipeline: ${outcomes.length} alerts → $queued queued in ${sw.elapsedMilliseconds} ms '
        '(${(sw.elapsedMicroseconds / outcomes.length / 1000).toStringAsFixed(2)} ms each)');
    expect(queued, 2000);
    expect(sw.elapsedMilliseconds, lessThan(60000));
    await db.close();
  });
}
