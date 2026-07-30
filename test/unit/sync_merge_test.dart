import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/domain/services/sync_merge.dart';

const now = 1700000000000;

SyncRecord rec(String id, int updatedAt, [Map<String, dynamic> extra = const {}]) =>
    SyncRecord(id: id, type: 'txn', updatedAt: updatedAt, value: {'id': id, ...extra});
Tombstone tomb(String id, int deletedAt) =>
    Tombstone(id: id, type: 'txn', deletedAt: deletedAt);
const empty = SyncBundle();

void main() {
  const m = SyncMerge();

  test('new record on remote is pulled in', () {
    final r = m.merge(empty, SyncBundle(records: [rec('a', now - 100)]), now: now);
    expect(r.upserts.length, 1);
    expect(r.upserts.first.id, 'a');
    expect(r.deletes, isEmpty);
  });

  test('local-only record is untouched', () {
    final r = m.merge(SyncBundle(records: [rec('a', now - 100)]), empty, now: now);
    expect(r.upserts, isEmpty);
    expect(r.deletes, isEmpty);
  });

  test('both edited same record → later updatedAt wins', () {
    final local = SyncBundle(records: [rec('a', now - 200, {'amt': 'L'})]);
    final remote = SyncBundle(records: [rec('a', now - 100, {'amt': 'R'})]);
    final r = m.merge(local, remote, now: now);
    expect(r.upserts.length, 1);
    expect(r.upserts.first.value['amt'], 'R');
    expect(m.merge(remote, local, now: now).upserts, isEmpty);
  });

  test('remote delete newer than local edit → removed locally', () {
    final local = SyncBundle(records: [rec('a', now - 200)]);
    final remote = SyncBundle(tombstones: [tomb('a', now - 100)]);
    final r = m.merge(local, remote, now: now);
    expect(r.deletes.length, 1);
    expect(r.upserts, isEmpty);
    expect(r.tombstones.any((t) => t.id == 'a'), isTrue);
  });

  test('local edit newer than remote delete → survives', () {
    final local = SyncBundle(records: [rec('a', now - 50)]);
    final remote = SyncBundle(tombstones: [tomb('a', now - 100)]);
    final r = m.merge(local, remote, now: now);
    expect(r.deletes, isEmpty);
    expect(r.upserts, isEmpty);
  });

  test('tie → delete wins', () {
    final local = SyncBundle(records: [rec('a', now - 100)]);
    final remote = SyncBundle(tombstones: [tomb('a', now - 100)]);
    expect(m.merge(local, remote, now: now).deletes.length, 1);
  });

  test('old tombstones GC-ed past TTL', () {
    final remote = SyncBundle(tombstones: [tomb('a', now - 200 * 24 * 3600 * 1000)]);
    expect(m.merge(empty, remote, now: now).tombstones, isEmpty);
  });

  test('re-sync is idempotent', () {
    final state = SyncBundle(
      records: [rec('a', now - 100), rec('b', now - 150)],
      tombstones: [tomb('c', now - 120)],
    );
    final r = m.merge(state, state, now: now);
    expect(r.upserts, isEmpty);
    expect(r.deletes, isEmpty);
  });
}
