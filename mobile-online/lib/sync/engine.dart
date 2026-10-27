// Encrypted sync (ADR 0006), the same protocol as webapp-online/src/lib/sync/engine.ts.
// The server stores ciphertext by sequence number and never merges; this engine:
// - sends local changes from an outbox in batches (<= 500);
// - pulls pages after the cursor {since, epoch};
// - last write wins on client_updated_at; a change the server already has a
//   newer version of is "stale" and the pull brings the newer one;
// - a deletion is a tombstone (no ciphertext);
// - reset_required (tombstones purged since our cursor): drop the local copy,
//   keep the outbox, resync from zero with the new epoch.
import '../crypto/bytes.dart';
import 'record_store.dart';

typedef Gateway = Future<Object?> Function(String method, String path, [Object? body]);

const maxBatch = 500;

class SyncReport {
  const SyncReport(this.pushed, this.pulled, this.reset);
  final int pushed;
  final int pulled;
  final bool reset;
}

bool _same(LocalRecord a, LocalRecord b) => a.collection == b.collection && a.recordId == b.recordId;

class SyncEngine {
  SyncEngine(this._gateway, this._store);
  final Gateway _gateway;
  final RecordStore _store;

  /// A local change: stored at once (so the app shows it) and queued for the server.
  Future<void> save(LocalRecord record) async {
    await _store.put(record);
    await _store.queue(record);
  }

  Future<int> pending() async => (await _store.outbox()).length;

  Future<SyncReport> sync() async {
    final pushed = await _push();
    final p = await _pull();
    return SyncReport(pushed, p.pulled, p.reset);
  }

  Future<int> _push() async {
    final outbox = await _store.outbox();
    for (var i = 0; i < outbox.length; i += maxBatch) {
      final batch = outbox.sublist(i, i + maxBatch > outbox.length ? outbox.length : i + maxBatch);
      await _gateway('POST', '/v1/sync/push', {
        'records': [
          for (final r in batch)
            {
              'record_id': r.recordId,
              'collection': r.collection,
              'client_updated_at': r.updatedAt,
              'deleted': r.deleted,
              'ciphertext': r.deleted || r.ciphertext == null ? null : toBase64(r.ciphertext!),
              'key_version': r.keyVersion,
            },
        ],
      });
      // Accepted or stale, the server has dealt with it: a stale one loses to
      // the newer version the pull is about to bring. Only drop what wasn't
      // edited again while the push was in flight.
      final current = await _store.outbox();
      for (final sent in batch) {
        final now = current.where((r) => _same(r, sent)).firstOrNull;
        if (now != null && now.updatedAt == sent.updatedAt) await _store.unqueue(sent);
      }
    }
    return outbox.length;
  }

  Future<({int pulled, bool reset})> _pull() async {
    var cursor = await _store.cursor();
    var pulled = 0;
    var reset = false;
    for (;;) {
      final page = await _gateway('GET', '/v1/sync/pull?since=${cursor.since}&epoch=${cursor.epoch}&limit=$maxBatch') as Map<String, dynamic>;
      if (page['reset_required'] == true) {
        if (reset) throw StateError('The server asked for a second reset in one sync.');
        reset = true;
        await _store.clear();
        cursor = Cursor(0, page['epoch'] as int);
        await _store.setCursor(cursor);
        continue;
      }
      final outbox = await _store.outbox();
      for (final raw in page['records'] as List<dynamic>) {
        final r = raw as Map<String, dynamic>;
        final deleted = r['deleted'] as bool;
        final cipher = r['ciphertext'] as String?;
        final incoming = LocalRecord(
          collection: r['collection'] as String,
          recordId: r['record_id'] as String,
          updatedAt: r['client_updated_at'] as String,
          deleted: deleted,
          ciphertext: deleted || cipher == null ? null : fromBase64(cipher),
          keyVersion: r['key_version'] as int,
        );
        // A newer local change not yet pushed wins (it goes up next sync).
        final queued = outbox.where((q) => _same(q, incoming)).firstOrNull;
        if (queued != null && !DateTime.parse(queued.updatedAt).isBefore(DateTime.parse(incoming.updatedAt))) continue;
        await _store.put(incoming);
        pulled++;
      }
      cursor = Cursor(page['last_seq'] as int, page['epoch'] as int);
      await _store.setCursor(cursor);
      if (page['more'] != true) return (pulled: pulled, reset: reset);
    }
  }
}
