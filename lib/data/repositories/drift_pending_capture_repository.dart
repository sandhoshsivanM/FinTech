import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart';

import 'package:khazana_domain/entities/pending_capture.dart';
import 'package:khazana_domain/entities/transaction.dart';
import 'package:khazana_domain/repositories/pending_capture_repository.dart';
import '../database/app_database.dart';
import '../database/pending_capture_dao.dart';

class DriftPendingCaptureRepository implements IPendingCaptureRepository {
  DriftPendingCaptureRepository(this._dao);
  final PendingCaptureDao _dao;

  @override
  Stream<List<PendingCapture>> watch(String vaultId) =>
      _dao.watchPending(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Stream<List<PendingCapture>> watchDecided(String vaultId,
          {required DateTime since}) =>
      _dao
          .watchDecided(vaultId, since.millisecondsSinceEpoch)
          .map((rows) => rows.map(_toEntity).toList());

  @override
  Future<PendingCapture?> getById(String id) async {
    final row = await _dao.getById(id);
    return row == null ? null : _toEntity(row);
  }

  @override
  Future<bool> exists(String vaultId, String fingerprint) =>
      _dao.existsByFingerprint(vaultId, fingerprint);

  @override
  Future<List<PendingCapture>> findByUtr(String vaultId, String utr) async =>
      (await _dao.findByUtr(vaultId, utr)).map(_toEntity).toList();

  @override
  Future<Decimal?> latestBalanceFor(String vaultId, String accountId) async =>
      (await _dao.latestWithBalance(vaultId, accountId))?.availableBalance;

  @override
  Future<List<PendingCapture>> pendingForSuffix(String vaultId, String last4) async =>
      (await _dao.pendingForSuffix(vaultId, last4)).map(_toEntity).toList();

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
        status: Value(c.status.key),
        confidence: Value(c.confidence),
        reasonCodes: Value(c.reasons.isEmpty ? null : ReviewReason.encode(c.reasons)),
        accountId: Value(c.accountId),
        categoryId: Value(c.categoryId),
        utr: Value(c.utr),
        accountLast4: Value(c.accountLast4),
        availableBalance: Value(c.availableBalance),
        instrument: Value(c.instrument.key),
        kind: Value(c.kind.key),
        profileId: Value(c.profileId),
        finalAmount: Value(c.finalAmount),
        decidedAt: Value(c.decidedAt?.millisecondsSinceEpoch),
        postedTxnId: Value(c.postedTxnId),
      ));

  @override
  Future<void> delete(String id) => _dao.deleteById(id);

  @override
  Future<int> purgeDecidedBefore(String vaultId, DateTime cutoff) =>
      _dao.purgeDecidedBefore(vaultId, cutoff.millisecondsSinceEpoch);

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
        status: CaptureStatus.fromKey(r.status),
        confidence: r.confidence,
        reasons: ReviewReason.decode(r.reasonCodes),
        accountId: r.accountId,
        categoryId: r.categoryId,
        utr: r.utr,
        accountLast4: r.accountLast4,
        availableBalance: r.availableBalance,
        instrument: CaptureInstrument.fromKey(r.instrument),
        kind: CaptureKind.fromKey(r.kind),
        profileId: r.profileId,
        finalAmount: r.finalAmount,
        decidedAt: r.decidedAt == null
            ? null
            : DateTime.fromMillisecondsSinceEpoch(r.decidedAt!),
        postedTxnId: r.postedTxnId,
      );
}

class DriftCaptureAccountLinkRepository implements ICaptureAccountLinkRepository {
  DriftCaptureAccountLinkRepository(this._dao);
  final PendingCaptureDao _dao;

  @override
  Future<List<CaptureAccountLink>> getAll(String vaultId) async =>
      (await _dao.linksForVault(vaultId)).map(_toEntity).toList();

  @override
  Stream<List<CaptureAccountLink>> watch(String vaultId) =>
      _dao.watchLinks(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Future<void> save(CaptureAccountLink l) => _dao.upsertLink(
        CaptureAccountLinksCompanion(
          id: Value(l.id),
          vaultId: Value(l.vaultId),
          profileId: Value(l.profileId),
          last4: Value(l.last4),
          instrument: Value(l.instrument.key),
          accountId: Value(l.accountId),
          createdAt: Value(l.createdAt.millisecondsSinceEpoch),
        ),
      );

  @override
  Future<void> delete(String id) => _dao.deleteLink(id);

  static CaptureAccountLink _toEntity(CaptureAccountLinkRow r) =>
      CaptureAccountLink(
        id: r.id,
        vaultId: r.vaultId,
        profileId: r.profileId,
        last4: r.last4,
        instrument: CaptureInstrument.fromKey(r.instrument),
        accountId: r.accountId,
        createdAt: DateTime.fromMillisecondsSinceEpoch(r.createdAt),
      );
}
