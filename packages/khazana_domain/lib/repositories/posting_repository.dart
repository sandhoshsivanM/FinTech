import '../entities/posting.dart';

/// Journal-posting repository contract. Pure domain — no Drift imports.
abstract interface class IPostingRepository {
  Stream<List<Posting>> watch(String vaultId);
  Future<List<Posting>> getAll(String vaultId);
  Future<List<Posting>> forEntry(String entryId);

  /// Atomically replaces all postings for an entry (re-derive on edit).
  Future<void> replaceForEntry(String entryId, List<Posting> postings);
  Future<void> deleteForEntry(String entryId);
}
