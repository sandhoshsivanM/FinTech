import 'package:drift/drift.dart';

import '../../domain/entities/posting.dart';
import '../../domain/repositories/posting_repository.dart';
import '../database/app_database.dart';
import '../database/posting_dao.dart';

class DriftPostingRepository implements IPostingRepository {
  DriftPostingRepository(this._dao);
  final PostingDao _dao;

  @override
  Stream<List<Posting>> watch(String vaultId) =>
      _dao.watchForVault(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Future<List<Posting>> getAll(String vaultId) async =>
      (await _dao.allForVault(vaultId)).map(_toEntity).toList();

  @override
  Future<List<Posting>> forEntry(String entryId) async =>
      (await _dao.forEntry(entryId)).map(_toEntity).toList();

  @override
  Future<void> replaceForEntry(String entryId, List<Posting> postings) =>
      _dao.replaceForEntry(entryId, postings.map(_toCompanion).toList());

  @override
  Future<void> deleteForEntry(String entryId) => _dao.deleteForEntry(entryId);

  static PostingsCompanion _toCompanion(Posting p) => PostingsCompanion(
        id: Value(p.id),
        vaultId: Value(p.vaultId),
        entryId: Value(p.entryId),
        accountId: Value(p.accountId),
        amount: Value(p.amount),
      );

  static Posting _toEntity(PostingRow r) => Posting(
        id: r.id,
        vaultId: r.vaultId,
        entryId: r.entryId,
        accountId: r.accountId,
        amount: r.amount,
      );
}
