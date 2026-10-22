# ADR 0006: Sync stores ciphertext by sequence and never merges

- **Status:** accepted (2026-10-22)

## Context
Devices sync the ledger end to end encrypted (design doc §8.4). The server
can't read records, so it can't resolve conflicts. It still has to stop a
lagging or malicious device from damaging everyone else's copy.

## Decision
- **Push:** up to 500 records. Each record is AES-256-GCM ciphertext of at
  most 64 KB, plus routing metadata (`record_id`, `collection`,
  `client_updated_at`, `deleted`, `key_version`).
  - The batch is validated as a whole and refused as a whole.
  - A per-user counter assigns sequence numbers in one statement. Its row lock
    serialises one user's pushes, so commit order is sequence order and a
    puller never skips a number that commits later.
- **An older version never replaces a newer one.** The upsert is guarded by
  `client_updated_at`. Refused records come back as `stale`, so the device
  pulls and merges.
- **Clocks:** a record stamped more than 5 minutes in the future is refused.
  Otherwise one bad clock would win every later conflict.
- **Pull:** records after a cursor, in sequence order, 500 per page.
- **Tombstones:** deleted records are kept for 90 days, then swept every
  6 hours. A cursor older than the newest purged tombstone gets
  `reset_required`, and the device resyncs from zero rather than keeping a
  record every other device deleted.
- **Events:** `RecordsPushedV1` (ids and a sequence number only) commits with
  the records through the outbox.
- **Revocation:** `DeviceRevokedV1` locks a device out at once, before its
  token expires.
- **Account deletion:** a purge runs after the cooling-off, then
  `UserDataPurgedV1` reports back.

## Consequences
- The server can't merge, so conflict resolution (last write wins by
  `updatedAt`; postings immutable once posted) lives in the Khazana Online sync engine
  (ADR 0007). The offline apps don't use this protocol.
- Metadata stays visible to the server: collection names, edit times, sizes.
  This is accepted in the design.
- **Open items:**
  - Attachments over 64 KB (S3 presigned URLs, local disk in development).
  - Key rotation through `key_version` re-encryption is driven by the client.
