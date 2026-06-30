# Architecture

Khazana is **one product shipped as two client apps** over a shared mental
model. There is **no server**: every app is a self-contained, offline-first
client that encrypts its own data at rest.

## Layered design (both apps)

Dependencies point **inward**; the domain layer imports no framework.

```
            ┌─────────────────────────────────────────────┐
 outermost  │  presentation / components   (screens, UI)   │
            ├─────────────────────────────────────────────┤
            │  features / app             (state, routing)  │   Riverpod (Flutter)
            ├─────────────────────────────────────────────┤   Zustand  (web)
            │  data                       (repository impls)│   Drift/SQLCipher · Dexie
            ├─────────────────────────────────────────────┤
 innermost  │  domain        (pure logic + repo interfaces) │   no framework imports
            └─────────────────────────────────────────────┘
```

- **domain** — pure functions + repository *interfaces*. Money is `Decimal`
  (`package:decimal` / `decimal.js`), never `double`.
- **data** — repository *implementations*: Drift DAOs over SQLCipher (Flutter),
  Dexie/IndexedDB storing encrypted blobs (web).
- **features / app** — state + screens. Vault lock/unlock is a state machine
  that drives routing (go_router redirects / Zustand gate).

## Dart ↔ TypeScript parity

The domain layer was ported Dart → TypeScript and is kept aligned on purpose, so
both apps produce identical results. Naming, weights, and algorithms match
across `lib/domain/services/*.dart` and `webapp/src/domain/*.ts`.

Parity is enforced by **mirrored tests**: the same fixtures and expected values
exist on both sides. For example the Safety Net readiness score
(`lib/domain/services/safety_net.dart` ↔ `webapp/src/domain/safetyNet.ts`) is
covered by `test/unit/safety_net_test.dart` and
`webapp/src/domain/safetyNet.test.ts` — both assert the same scores (100 / 25 /
50 / 85) for the same inputs.

## Encryption contract

Both platforms honor one contract — *data is unreadable without the user's PIN*:

| Step | Flutter (mobile) | Web |
|---|---|---|
| Key derivation | PBKDF2-HMAC-SHA256, 600k iters, 32-byte salt (`key_derivation_service.dart`) | same params via Web Crypto (`crypto.ts`) |
| At-rest cipher | SQLCipher `PRAGMA key` over the whole SQLite file (`encrypted_executor.dart`) | AES-256-GCM per record, fresh 12-byte IV (`crypto.ts`) |
| Key storage | salt in Keychain / Keystore (`flutter_secure_storage`) | salt in IndexedDB; key never persisted |
| Unlock | biometric / PIN, fast-fail probe query | PIN, GCM auth-tag verification |
| Lock | key purged from memory; lock-on-background | key purged; 5-min inactivity auto-lock |

Details and trust boundaries: [THREAT-MODEL.md](THREAT-MODEL.md).

## Data layer

- **13 Drift tables**, DAO-per-table, repository wrappers; `schemaVersion = 2`
  with an `onUpgrade` migration (insurance + net-worth snapshots).
- **FTS5** virtual table + sync triggers + porter tokenizer for transaction
  search; `vaultId` indexed on every table for multi-profile isolation.
- Money columns are **TEXT/Decimal** via a custom converter — no float drift.
- Web mirrors this with Dexie object stores of `{iv, ct}` encrypted blobs plus a
  `tombstones` store for sync.

## Serverless sync

`sync_merge.dart` / `syncMerge.ts` implement a deterministic **last-write-wins**
merge keyed on `updatedAt`, with **tombstones retained 90 days**. The function
is symmetric (runs identically on both peers) and is unit-tested
(`webapp/scripts/sync-merge.test.ts`).

## Measured performance

Numbers below are **measured on a development host** via the committed
benchmark scripts (machine-dependent; recorded for honesty, not as guarantees).

Reproduce:

```bash
node webapp/scripts/bench-crypto.ts
flutter test test/benchmark/crypto_fts_bench_test.dart
```

| Primitive | Path | Measured (host) |
|---|---|---|
| PBKDF2-HMAC-SHA256 600k → 256-bit key | Web Crypto (Node v24) | **mean ≈ 45 ms** |
| PBKDF2-HMAC-SHA256 600k → 256-bit key | Pure Dart `pointycastle` (Dart VM, JIT) | **mean ≈ 1.2 s** |
| AES-256-GCM encrypt (transaction-sized record) | Web Crypto | **≈ 0.018 ms (~56,600 ops/s)** |
| AES-256-GCM decrypt | Web Crypto | **≈ 0.022 ms (~45,800 ops/s)** |
| FTS5 search over 10,000 transactions | Drift / SQLite (host) | **mean ≈ 0.13 ms** |

Notes:
- The 600k-iteration cost is **intentional** (brute-force resistance); ~45 ms on
  web is the unlock latency budget. The pure-Dart figure is the JIT test-VM path;
  on web Flutter uses Web Crypto, and on native release builds AOT is faster than
  the JIT number shown.
- The FTS5 result is far under the PRD's ≤100 ms on-device target for 10k rows,
  on a host machine.

## CI

`.github/workflows/ci.yml` runs on every push / PR:

- **Web job** — `npm ci` → `npm run test` (hard gate) → `npm run build` (hard
  gate) → `npm run lint` (advisory; see the README lint note).
- **Flutter job** — `flutter pub get` → `build_runner` codegen → `flutter
  analyze` → `flutter test`.
