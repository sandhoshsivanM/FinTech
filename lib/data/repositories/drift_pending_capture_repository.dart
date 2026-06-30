import 'package:drift/drift.dart';

import '../../domain/entities/pending_capture.dart';
import '../../domain/entities/transaction.dart';
import '../../domain/repositories/pending_capture_repository.dart';
import '../database/app_database.dart';
import '../database/pending_capture_dao.dart';

class DriftPendingCaptureRepository implements IPendingCaptureRepository {
  DriftPendingCaptureRepository(this._dao);
  final PendingCaptureDao _dao;

  @override
  Stream<List<PendingCapture>> watch(String vaultId) =>
      _dao.watchForVault(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Future<bool> exists(String vaultId, String fingerprint) =>
      _dao.existsByFingerprint(vaultId, fingerprint);

  @override
  Future<void> save(PendingCapture c) => _dao.upsert(PendingCapturesCompanion(
        id: Value(c.id),
        vaultId: Value(c.vaultId),
        amount: Value(c.amount),
        type: Value(c.type == TxnType.income ? 'income' : 'expense'),
        merchant: Value(c.merchant),
        occurredAt: Value(c.occurredAt.millisecondsSinceEpoch),
        source: Value(c.source.key),
        uncategorized: Value(c.uncategorized),
        fingerprint: Value(c.fingerprint),
        capturedAt: Value(c.capturedAt.millisecondsSinceEpoch),
      ));

  @override
  Future<void> delete(String id) => _dao.deleteById(id);

  static PendingCapture _toEntity(PendingCaptureRow r) => PendingCapture(
        id: r.id,
        vaultId: r.vaultId,
        amount: r.amount,
        type: r.type == 'income' ? TxnType.income : TxnType.expense,
        merchant: r.merchant,
        occurredAt: DateTime.fromMillisecondsSinceEpoch(r.occurredAt),
        source: CaptureSource.fromKey(r.source),
        uncategorized: r.uncategorized,
        fingerprint: r.fingerprint,
        capturedAt: DateTime.fromMillisecondsSinceEpoch(r.capturedAt),
      );
}
