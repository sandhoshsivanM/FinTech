import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_merchant_alias_repository.dart';
import 'package:khazana/data/repositories/drift_pending_capture_repository.dart';
import 'package:khazana/data/repositories/drift_transaction_repository.dart';
import 'package:khazana/domain/entities/pending_capture.dart';
import 'package:khazana/features/capture/services/capture_channel.dart';
import 'package:khazana/features/capture/services/capture_pipeline.dart';
import 'package:khazana/features/capture/services/sms_catch_up.dart';
import 'package:decimal/decimal.dart';
import 'package:khazana/domain/entities/transaction.dart';

/// Stands in for the Android side: an SMS inbox and a permission switch.
class _FakeChannel extends CaptureChannel {
  _FakeChannel(this.inbox);
  final List<CapturedMessage> inbox;
  bool granted = true;
  final reads = <DateTime>[];

  @override
  Future<bool> isSmsPermissionGranted() async => granted;

  @override
  Future<List<CapturedMessage>> readSmsSince(DateTime since, {int limit = 2000}) async {
    reads.add(since);
    return inbox.where((m) => m.postedAt.isAfter(since)).toList();
  }
}

class _MemoryCursor implements SmsScanCursor {
  DateTime? at;
  @override
  Future<DateTime?> read() async => at;
  @override
  Future<void> write(DateTime value) async => at = value;
}

class _NoopPoster implements CapturePoster {
  @override
  Future<String> post({required Decimal amount, required TxnType type, required String categoryId,
      required DateTime date, String? merchant, String? accountId, required String source,
      required String captureId}) async => 'txn';
  @override
  Future<void> remove(String txnId) async {}
}

void main() {
  late AppDatabase db;
  late _FakeChannel channel;
  late _MemoryCursor cursor;
  late SmsCatchUp catchUp;
  var now = DateTime(2026, 1, 20, 9);

  CapturedMessage sms(String text, DateTime at) =>
      CapturedMessage(text: text, sender: 'VM-HDFCBK', source: CaptureSource.sms, postedAt: at);

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    channel = _FakeChannel([
      sms('Rs 150.00 debited from a/c XX1234 at CAFE BREW on 10-01-26. Avl Bal Rs 9,850.00',
          DateTime(2026, 1, 10, 8)),
      sms('Rs 250.00 debited from a/c XX1234 at SWIGGY on 19-01-26. Avl Bal Rs 9,600.00',
          DateTime(2026, 1, 19, 21)),
    ]);
    cursor = _MemoryCursor();
    now = DateTime(2026, 1, 20, 9);
    final pipeline = CapturePipeline(
      repo: DriftPendingCaptureRepository(db.pendingCaptureDao),
      links: DriftCaptureAccountLinkRepository(db.pendingCaptureDao),
      aliases: DriftMerchantAliasRepository(db.merchantAliasDao),
      transactions: DriftTransactionRepository(db.transactionDao),
      poster: _NoopPoster(),
      vaultId: 'v1',
      clock: () => now,
    );
    catchUp = SmsCatchUp(channel: channel, pipeline: pipeline, cursor: cursor, clock: () => now);
  });

  tearDown(() => db.close());

  test('the first run only starts the clock — granting SMS access imports nothing', () async {
    final result = await catchUp.run();
    expect(result.isEmpty, isTrue);
    expect(channel.reads, isEmpty);
    expect(cursor.at, now);
  });

  test('later runs read only what arrived since the last scan, with an overlap', () async {
    cursor.at = DateTime(2026, 1, 19, 12);
    final result = await catchUp.run();
    expect(result.queued, 1, reason: 'only the 19 Jan evening SMS is new');
    expect(channel.reads.single, DateTime(2026, 1, 19, 11), reason: 'one hour of overlap');
    expect(cursor.at, now);
  });

  test('re-reading the overlap does not queue anything twice', () async {
    cursor.at = DateTime(2026, 1, 19, 12);
    await catchUp.run();
    now = now.add(const Duration(minutes: 10));
    cursor.at = DateTime(2026, 1, 19, 22); // overlap reaches back past the 21:00 SMS
    final again = await catchUp.run();
    expect(again.isEmpty, isTrue);
  });

  test('history import reads the whole window and moves the cursor', () async {
    final result = await catchUp.importHistory(window: const Duration(days: 30));
    expect(result.queued, 2);
    expect(cursor.at, now);
  });

  test('without the permission nothing is read at all', () async {
    channel.granted = false;
    expect((await catchUp.importHistory()).isEmpty, isTrue);
    expect(channel.reads, isEmpty);
  });
}
