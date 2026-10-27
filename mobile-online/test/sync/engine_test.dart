import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/crypto/bytes.dart';
import 'package:khazana_online/sync/engine.dart';
import 'package:khazana_online/sync/record_store.dart';

/// The Sync service's rules in memory (SyncRules, SyncHandlers, SyncService),
/// as in webapp-online/src/lib/sync/engine.test.ts.
class FakeSync {
  final rows = <String, Map<String, dynamic>>{};
  int seq = 0;
  int epoch = 0;
  int purgedThrough = 0;
  int pushes = 0;

  Gateway as() => (method, path, [body]) async => handle(method, path, body as Map<String, dynamic>?);

  Object? handle(String method, String path, Map<String, dynamic>? body) {
    if (method == 'POST' && path == '/v1/sync/push') {
      final records = body!['records'] as List<dynamic>;
      if (records.length > maxBatch) throw StateError('400 batch too large');
      pushes++;
      final stale = <String>[];
      for (final r in records.cast<Map<String, dynamic>>()) {
        final key = '${r['collection']}/${r['record_id']}';
        final existing = rows[key];
        seq++;
        if (existing != null && DateTime.parse(existing['client_updated_at'] as String).isAfter(DateTime.parse(r['client_updated_at'] as String))) {
          stale.add(r['record_id'] as String);
          continue;
        }
        rows[key] = {...r, 'seq': seq};
      }
      return {'accepted': records.length - stale.length, 'stale': stale, 'last_seq': seq};
    }
    final q = Uri.parse('http://x$path').queryParameters;
    final since = int.parse(q['since']!), reqEpoch = int.parse(q['epoch']!), limit = int.parse(q['limit']!);
    if (since > 0 && reqEpoch != epoch && since < purgedThrough) {
      return {'records': [], 'last_seq': 0, 'epoch': epoch, 'more': false, 'reset_required': true};
    }
    final after = rows.values.where((r) => (r['seq'] as int) > since).toList()..sort((a, b) => (a['seq'] as int).compareTo(b['seq'] as int));
    final page = after.take(limit).toList();
    return {
      'records': page,
      'last_seq': page.isEmpty ? (since > seq ? since : seq) : page.last['seq'],
      'epoch': epoch,
      'more': after.length > limit,
      'reset_required': false,
    };
  }

  /// The 90-day sweep: tombstones go, and cursors from before it need a reset.
  void purgeTombstones() {
    rows.removeWhere((_, r) => r['deleted'] == true);
    purgedThrough = seq;
    epoch++;
  }
}

var _clock = DateTime.utc(2026, 10, 23, 10).millisecondsSinceEpoch;
LocalRecord rec(String id, String body, {bool deleted = false}) {
  _clock += 1000;
  return LocalRecord(
    collection: 'accounts',
    recordId: id,
    updatedAt: DateTime.fromMillisecondsSinceEpoch(_clock, isUtc: true).toIso8601String(),
    deleted: deleted,
    ciphertext: deleted ? null : Uint8List.fromList(utf8.encode(body.padRight(28, '.'))),
    keyVersion: 1,
  );
}

String? text(LocalRecord? r) =>
    r?.ciphertext != null ? utf8.decode(r!.ciphertext!).replaceAll(RegExp(r'\.+$'), '') : (r?.deleted == true ? '<deleted>' : null);

void main() {
  test('a change on the laptop reaches the phone', () async {
    final server = FakeSync();
    final laptop = SyncEngine(server.as(), MemoryRecordStore());
    final phoneStore = MemoryRecordStore();
    final phone = SyncEngine(server.as(), phoneStore);
    await laptop.save(rec('a1', 'HDFC Savings'));
    expect((await laptop.sync()).pushed, 1);
    expect((await phone.sync()).pulled, 1);
    expect(text(phoneStore.records['accounts/a1']), 'HDFC Savings');
    expect(await laptop.pending(), 0);
  });

  test('both edit the same record: the later edit wins on both devices', () async {
    final server = FakeSync();
    final aStore = MemoryRecordStore(), bStore = MemoryRecordStore();
    final a = SyncEngine(server.as(), aStore), b = SyncEngine(server.as(), bStore);
    await a.save(rec('a1', 'v1'));
    await a.sync();
    await b.sync();
    await a.save(rec('a1', 'older edit'));
    await b.save(rec('a1', 'newer edit'));
    await b.sync();
    await a.sync(); // a's edit is stale; the pull brings b's
    await b.sync();
    expect(text(aStore.records['accounts/a1']), 'newer edit');
    expect(text(bStore.records['accounts/a1']), 'newer edit');
    expect(await a.pending(), 0);
  });

  test('an offline change waits in the outbox and goes up later', () async {
    final server = FakeSync();
    var online = false;
    final store = MemoryRecordStore();
    final phone = SyncEngine((m, p, [b]) async {
      if (!online) throw const FormatException('offline');
      return server.as()(m, p, b);
    }, store);
    await phone.save(rec('t1', 'Coffee 120'));
    await expectLater(phone.sync(), throwsFormatException);
    expect(await phone.pending(), 1);
    expect(text(store.records['accounts/t1']), 'Coffee 120');
    online = true;
    await phone.sync();
    expect(await phone.pending(), 0);
    expect(server.rows.containsKey('accounts/t1'), isTrue);
  });

  test('a deletion travels as a tombstone', () async {
    final server = FakeSync();
    final a = SyncEngine(server.as(), MemoryRecordStore());
    final bStore = MemoryRecordStore();
    final b = SyncEngine(server.as(), bStore);
    await a.save(rec('a1', 'Old card'));
    await a.sync();
    await b.sync();
    await a.save(rec('a1', '', deleted: true));
    await a.sync();
    await b.sync();
    expect(text(bStore.records['accounts/a1']), '<deleted>');
    expect(server.rows['accounts/a1']!['ciphertext'], isNull);
  });

  test('more than one page and more than one batch', () async {
    final server = FakeSync();
    final a = SyncEngine(server.as(), MemoryRecordStore());
    final bStore = MemoryRecordStore();
    final b = SyncEngine(server.as(), bStore);
    for (var i = 0; i < 1203; i++) {
      await a.save(rec('r$i', 'n$i'));
    }
    await a.sync();
    expect(server.pushes, 3);
    await b.sync();
    expect(bStore.records.length, 1203);
  });

  test('after tombstones are purged, a device behind the purge resyncs from zero and keeps its unpushed change', () async {
    final server = FakeSync();
    final a = SyncEngine(server.as(), MemoryRecordStore());
    final bStore = MemoryRecordStore();
    final b = SyncEngine(server.as(), bStore);
    await a.save(rec('keep', 'stays'));
    await a.save(rec('gone', 'will be deleted'));
    await a.sync();
    await b.sync();
    await a.save(rec('gone', '', deleted: true));
    await a.save(rec('more', 'after'));
    await a.sync();
    server.purgeTombstones();
    await b.save(rec('mine', 'offline edit'));
    final report = await b.sync();
    expect(report.reset, isTrue);
    expect(bStore.records.containsKey('accounts/gone'), isFalse);
    expect(text(bStore.records['accounts/more']), 'after');
    expect(server.rows.containsKey('accounts/mine'), isTrue);
    expect((await bStore.cursor()).epoch, server.epoch);
    expect((await b.sync()).reset, isFalse);
  });

  test('an edit made while a push is in flight is not lost', () async {
    final server = FakeSync();
    final store = MemoryRecordStore();
    late SyncEngine engine;
    engine = SyncEngine((m, p, [b]) async {
      if (m == 'POST') await engine.save(rec('a1', 'second edit'));
      return server.as()(m, p, b);
    }, store);
    await engine.save(rec('a1', 'first edit'));
    await engine.sync();
    expect(await engine.pending(), 1);
    expect(text(store.records['accounts/a1']), 'second edit');
  });

  test('the wire format is the web client\'s: snake_case fields, base64 ciphertext, null for tombstones', () async {
    Map<String, dynamic>? sent;
    final engine = SyncEngine((m, p, [b]) async {
      if (m == 'POST') {
        sent = b as Map<String, dynamic>;
        return {'accepted': 2, 'stale': [], 'last_seq': 2};
      }
      return {'records': [], 'last_seq': 2, 'epoch': 0, 'more': false, 'reset_required': false};
    }, MemoryRecordStore());
    final live = rec('a1', 'x');
    await engine.save(live);
    await engine.save(rec('a2', '', deleted: true));
    await engine.sync();
    final records = (sent!['records'] as List).cast<Map<String, dynamic>>();
    expect(records[0].keys.toSet(), {'record_id', 'collection', 'client_updated_at', 'deleted', 'ciphertext', 'key_version'});
    expect(records[0]['ciphertext'], toBase64(live.ciphertext!));
    expect(records[1]['ciphertext'], isNull);
  });

  test('the file store survives a restart: records, outbox and cursor', () async {
    final server = FakeSync();
    final dir = await Directory.systemTemp.createTemp('khazana_store');
    addTearDown(() => dir.delete(recursive: true));
    final file = File('${dir.path}/r.json');
    final one = await FileRecordStore.open(file);
    final engine = SyncEngine(server.as(), one);
    await engine.save(rec('a1', 'kept'));
    await engine.save(rec('a2', 'queued'));
    await engine.sync();
    await engine.save(rec('a3', 'unsent'));
    final two = await FileRecordStore.open(file);
    expect(two.records.keys.toSet(), {'accounts/a1', 'accounts/a2', 'accounts/a3'});
    expect((await two.outbox()).map((r) => r.recordId), ['a3']);
    expect((await two.cursor()).since, server.seq);
    await file.writeAsString('not json');
    expect((await FileRecordStore.open(file)).records, isEmpty);
  });
}
