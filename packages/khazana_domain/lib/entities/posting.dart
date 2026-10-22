import 'package:decimal/decimal.dart';

/// One leg of a double-entry journal entry (PRD §16). [amount] is *debit-signed*:
/// positive for a debit, negative for a credit. The postings that share an
/// [entryId] must always sum to exactly zero (debits = credits). Postings are
/// the authoritative ledger; the [Txn] header is a denormalized fast-path.
class Posting {
  const Posting({
    required this.id,
    required this.vaultId,
    required this.entryId,
    required this.accountId,
    required this.amount,
  });

  final String id;
  final String vaultId;
  final String entryId; // the Txn this posting belongs to
  final String accountId;
  final Decimal amount; // debit-signed; entry-wide sum == 0
}
