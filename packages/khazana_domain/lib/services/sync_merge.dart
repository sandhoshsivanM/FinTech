// Per-record last-write-wins merge with soft-delete tombstones (CRDT-lite).
// Pure + deterministic; mirrors the web app's `syncMerge.ts` exactly so both
// peers converge to an identical state. No Flutter/Drift deps — just data.

/// A syncable record. [value] is the full entity as a JSON-ish map.
class SyncRecord {
  const SyncRecord({
    required this.id,
    required this.type,
    required this.updatedAt,
    required this.value,
  });
  final String id;
  final String type;
  final int updatedAt; // epoch ms
  final Map<String, dynamic> value;
}

/// A soft-delete marker.
class Tombstone {
  const Tombstone({required this.id, required this.type, required this.deletedAt});
  final String id;
  final String type;
  final int deletedAt; // epoch ms
}

class SyncBundle {
  const SyncBundle({this.records = const [], this.tombstones = const []});
  final List<SyncRecord> records;
  final List<Tombstone> tombstones;
}

/// What the LOCAL store must change to reach the merged state.
class MergeResult {
  const MergeResult({
    required this.upserts,
    required this.deletes,
    required this.tombstones,
  });
  final List<SyncRecord> upserts; // records to write locally
  final List<Tombstone> deletes; // records to remove locally
  final List<Tombstone> tombstones; // merged tombstone set to persist (GC'd)
}

const int tombstoneTtlMs = 90 * 24 * 60 * 60 * 1000; // 90 days

String _key(String type, String id) => '$type $id';

/// Merge [remote] into [local]. Symmetric: running on both peers converges them.
/// On a timestamp tie, delete wins (intentional, idempotent, avoids resurrection).
class SyncMerge {
  const SyncMerge();

  MergeResult merge(SyncBundle local, SyncBundle remote, {int? now}) {
    final ts = now ?? DateTime.now().millisecondsSinceEpoch;

    final localRec = {for (final r in local.records) _key(r.type, r.id): r};
    final localTomb = {for (final t in local.tombstones) _key(t.type, t.id): t};
    final remoteRec = {for (final r in remote.records) _key(r.type, r.id): r};
    final remoteTomb = {for (final t in remote.tombstones) _key(t.type, t.id): t};

    final keys = <String>{
      ...localRec.keys,
      ...localTomb.keys,
      ...remoteRec.keys,
      ...remoteTomb.keys,
    };

    final upserts = <SyncRecord>[];
    final deletes = <Tombstone>[];
    final mergedTombs = <Tombstone>[];

    for (final k in keys) {
      final lr = localRec[k];
      final lt = localTomb[k];
      final rr = remoteRec[k];
      final rt = remoteTomb[k];

      // Winning event across both peers.
      var winnerKind = ''; // '' | 'upsert' | 'delete'
      var winnerTs = -1;
      SyncRecord? winnerRecord;
      Tombstone? winnerTomb;

      void consider(String kind, int t, {SyncRecord? record, Tombstone? tomb}) {
        final take = winnerKind.isEmpty ||
            t > winnerTs ||
            (t == winnerTs && kind == 'delete');
        if (take) {
          winnerKind = kind;
          winnerTs = t;
          winnerRecord = record;
          winnerTomb = tomb;
        }
      }

      if (lr != null) consider('upsert', lr.updatedAt, record: lr);
      if (rr != null) consider('upsert', rr.updatedAt, record: rr);
      if (lt != null) consider('delete', lt.deletedAt, tomb: lt);
      if (rt != null) consider('delete', rt.deletedAt, tomb: rt);
      if (winnerKind.isEmpty) continue;

      // Merged tombstone = newest delete event, kept within the GC window.
      final newestTombTs = [
        lt?.deletedAt ?? -1,
        rt?.deletedAt ?? -1,
      ].reduce((a, b) => a > b ? a : b);
      if (newestTombTs >= 0 && ts - newestTombTs <= tombstoneTtlMs) {
        final t = (rt != null && rt.deletedAt == newestTombTs) ? rt : lt!;
        mergedTombs.add(Tombstone(id: t.id, type: t.type, deletedAt: newestTombTs));
      }

      if (winnerKind == 'upsert') {
        final localIsCurrent = lr != null &&
            lr.updatedAt >= winnerRecord!.updatedAt &&
            !(lt != null && lt.deletedAt > lr.updatedAt);
        if (!localIsCurrent) upserts.add(winnerRecord!);
      } else {
        if (lr != null && !(lt != null && lt.deletedAt >= winnerTs)) {
          deletes.add(winnerTomb!);
        }
      }
    }

    return MergeResult(
        upserts: upserts, deletes: deletes, tombstones: mergedTombs);
  }
}
