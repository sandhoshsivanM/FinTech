// Where capture drafts go. The sync engine (ADR 0006) will provide the real
// sink that stores them in the encrypted vault; until it lands, drafts live in
// the device keychain/keystore ([SecureCaptureSink]) so nothing is lost.
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'capture_draft.dart';

abstract class CaptureSink {
  /// Adds [draft]. Returns false (and changes nothing) when a draft with the
  /// same fingerprint is already there, whatever its status: a re-delivered
  /// alert must not come back after the user rejected it.
  Future<bool> add(CaptureDraft draft);

  /// All drafts, newest first.
  Future<List<CaptureDraft>> all();

  /// Marks a draft approved or rejected. [edited] carries the user's
  /// corrections (amount, merchant, date, direction) on approval.
  Future<void> decide(String id, DraftStatus status, {CaptureDraft? edited});
}

class InMemoryCaptureSink implements CaptureSink {
  final Map<String, CaptureDraft> _byId = {};

  @override
  Future<bool> add(CaptureDraft draft) async {
    if (_byId.containsKey(draft.id)) return false;
    _byId[draft.id] = draft;
    return true;
  }

  @override
  Future<List<CaptureDraft>> all() async =>
      _byId.values.toList()..sort((a, b) => b.capturedAt.compareTo(a.capturedAt));

  @override
  Future<void> decide(String id, DraftStatus status, {CaptureDraft? edited}) async {
    final cur = _byId[id];
    if (cur == null) return;
    _byId[id] = (edited ?? cur).copyWith(status: status, decidedAt: DateTime.now());
  }
}

/// Persists parsed values (never message text) as one JSON list in the
/// platform keystore. The iOS shortcut can run while the phone is locked, so
/// the Keychain item is readable after first unlock, and never leaves this
/// device (no iCloud sync, no backup restore to another phone).
class SecureCaptureSink implements CaptureSink {
  SecureCaptureSink([FlutterSecureStorage? storage])
      : _s = storage ??
            const FlutterSecureStorage(
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
            );
  final FlutterSecureStorage _s;

  static const storageKey = 'khazana_online.capture_drafts.v1';

  /// Decided drafts older than this many are pruned, oldest first.
  static const maxDecided = 200;

  Future<List<CaptureDraft>> _load() async {
    final raw = await _s.read(key: storageKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw);
      if (list is! List) return [];
      return [for (final j in list) ?CaptureDraft.tryFromJson(j)];
    } catch (_) {
      return [];
    }
  }

  Future<void> _save(List<CaptureDraft> drafts) async {
    final pending = drafts.where((d) => d.status == DraftStatus.pending).toList();
    final decided = drafts.where((d) => d.status != DraftStatus.pending).toList()
      ..sort((a, b) => b.capturedAt.compareTo(a.capturedAt));
    final kept = [...pending, ...decided.take(maxDecided)];
    await _s.write(key: storageKey, value: jsonEncode([for (final d in kept) d.toJson()]));
  }

  @override
  Future<bool> add(CaptureDraft draft) async {
    final drafts = await _load();
    if (drafts.any((d) => d.id == draft.id)) return false;
    await _save([...drafts, draft]);
    return true;
  }

  @override
  Future<List<CaptureDraft>> all() async =>
      (await _load())..sort((a, b) => b.capturedAt.compareTo(a.capturedAt));

  @override
  Future<void> decide(String id, DraftStatus status, {CaptureDraft? edited}) async {
    final drafts = await _load();
    final i = drafts.indexWhere((d) => d.id == id);
    if (i < 0) return;
    drafts[i] = (edited ?? drafts[i]).copyWith(status: status, decidedAt: DateTime.now());
    await _save(drafts);
  }
}
