# How Khazana Works — End-to-End Walkthrough

This document explains the **whole project**: what it is, how a session runs from
cold start to a rendered screen, how data is encrypted and stored, how the
financial math is computed, and how the two apps stay in lockstep. It is written
against the actual code — every claim points at a real file.

For the layered diagram, encryption contract table, and measured benchmarks see
[ARCHITECTURE.md](ARCHITECTURE.md); for the security boundaries see
[THREAT-MODEL.md](THREAT-MODEL.md).

---

## 1. The one-paragraph version

Khazana is an **offline-first, serverless personal-finance app**. There is **no
backend** — every byte of financial data lives **encrypted at rest on the user's
own device**, unlocked only by their PIN. It is shipped **twice** from one shared
design: a **Flutter** app (iOS/Android/Web) and a **Next.js/React** web app
(`webapp/`, also packageable as a Tauri desktop app). Both apps share a
**framework-free financial "domain" layer** that is deliberately written once in
Dart and ported to TypeScript, so they compute identical numbers.

---

## 2. The mental model

Think of each app as four rings, dependencies pointing **inward**:

```
presentation / UI   →   features / state   →   data (storage)   →   domain (pure logic)
   screens, charts       Riverpod / Zustand     SQLCipher / Dexie    no framework imports
```

- The **domain** core knows nothing about Flutter, React, or databases. It is
  just functions over plain entities (`Txn`, `Goal`, `Holding`, …). This is what
  makes it portable between Dart and TypeScript and trivially testable.
- The **data** ring turns those entities into **encrypted bytes** on disk.
- The **features/state** ring holds the unlocked session and feeds screens.
- The **presentation** ring is the UI.

The single most important rule: **money is never a `double`.** It is an
arbitrary-precision `Decimal` (`package:decimal` in Dart, `decimal.js` on web)
end-to-end, and stored as TEXT — so totals never drift by a rounding cent.

---

## 3. A session, start to finish

### 3a. Cold start → the vault gate

When either app launches, it does **not** show your data. It shows a lock gate.

- **Web** (`webapp/src/lib/store.ts` → `init()`): reads the vault metadata row
  from IndexedDB. If a vault exists, status becomes `locked`; if not,
  `uninitialized` (first run). The router/gate shows the PIN screen accordingly.
- **Flutter** (`lib/core/router/app_router.dart`): a `GoRouter` whose `redirect`
  sends **every** `/app/*` route to `/unlock` unless the vault state is
  `VaultUnlocked`. The vault state is a small state machine
  (`lib/core/security/vault_state.dart`).

### 3b. PIN → encryption key (the heart of it)

You type a PIN. It is **never stored**. Instead it is stretched into a 256-bit
key:

```
PIN + 32-byte salt  ──PBKDF2-HMAC-SHA256, 600,000 iterations──▶  256-bit AES key
```

- **Web**: `deriveKey()` in `webapp/src/lib/crypto.ts` (Web Crypto
  `deriveKey`/`deriveBits`).
- **Flutter**: `KeyDerivationService` in
  `lib/core/security/key_derivation_service.dart` — pure-Dart `pointycastle` on
  native (run **off the UI isolate** via `Isolate.run` so unlock doesn't jank),
  and Web Crypto when Flutter is compiled to JS. Both paths are standard PBKDF2,
  so they produce the **same** key.

The 600k iterations are deliberate: they make brute-forcing the PIN expensive
(~45 ms per guess on web — see the benchmark table in
[ARCHITECTURE.md](ARCHITECTURE.md#measured-performance)).

### 3c. Verifying the PIN without storing it

How does the app know the PIN was right if it never stored it? It stored a
**verifier**: at setup it encrypted a known token (`"FTOS-OK"`) with the derived
key. On unlock (`unlock()` in `store.ts`) it derives the key from the entered
PIN and tries to **decrypt the verifier**:

- AES-GCM is *authenticated* — a wrong key fails the auth-tag check and throws.
- So a wrong PIN simply can't decrypt the verifier ⇒ "Incorrect PIN", no data
  exposed. On mobile the equivalent is a fast-fail probe query against the
  SQLCipher database.

### 3d. Loading data

On a correct PIN the key is held **in memory only** (`key: CryptoKey` in the
Zustand store; never persisted). Then `reload()` runs:

1. Read every encrypted record for the vault from storage.
2. **Decrypt each** with the session key.
3. Filter to the **active profile** (`self` / `spouse` / `business`) — multi-vault
   isolation via a `profileId` on each record (`inProfile()` in `store.ts`).
4. Seed defaults on first run (11 categories, a "Personal" profile).
5. Put the decrypted, in-memory entities into the store; screens render.

### 3e. Lock

On inactivity (5-min auto-lock on web) or app-backgrounding (mobile), `lock()`
**clears the key and wipes the decrypted data out of memory**, returning to the
gate. The on-disk bytes remain ciphertext the whole time.

---

## 4. How data is stored (the "data" ring)

The contract is identical across platforms — *only non-sensitive keys are
plaintext; the value is always ciphertext* — but the engines differ:

### Web — Dexie / IndexedDB (`webapp/src/lib/db.ts`, `repo.ts`)

Each entity is stored as an `EncRecord`:

```ts
{ id: "txn:<uuid>", type: "txn", vaultId: "default", enc: { iv, ct } }
//  ^id/type/vaultId are plaintext (for indexing only)  ^^ AES-256-GCM ciphertext
```

- `putRecord()` JSON-serializes the entity, AES-GCM-encrypts it with a **fresh
  12-byte IV**, and writes the blob.
- `listRecords()` reads by the `[type+vaultId]` index and decrypts each blob with
  the session key (silently skipping anything that won't decrypt).
- Deletes also drop a **tombstone** for sync (see §7).

### Flutter — Drift over SQLCipher (`lib/data/`)

- A `@DriftDatabase` with **13 tables / 12 DAOs**; the whole SQLite **file** is
  encrypted by SQLCipher (`PRAGMA key` is the first statement —
  `lib/data/database/encrypted_executor.dart`).
- **FTS5** virtual table + triggers + porter tokenizer give full-text
  transaction search that stays in sync automatically.
- `schemaVersion = 2` with an `onUpgrade` migration (added insurance +
  net-worth snapshots). Money columns are **TEXT/Decimal** via a custom
  converter.

So on web the *records* are individually encrypted; on mobile the *whole
database file* is encrypted. Same guarantee, two mechanisms.

---

## 5. The financial engine (the "domain" ring)

This is the part worth showing in an interview. It is **pure functions** — no
framework, no I/O — living in `lib/domain/services/*.dart` and mirrored in
`webapp/src/domain/*.ts`. Highlights:

| Service | What it computes |
|---|---|
| `net_worth_calculator` / `finance.ts` | income/expense windows, net worth from signed cash flow |
| `financial_health` / `health.ts` | 0–100 score over 4 weighted areas — Wealth 30, Protection 25, Efficiency 25, Future 20. Untracked areas leave the denominator rather than scoring zero, and below 50 points tracked the score gets no letter grade |
| `xirr_calculator` / `tax.ts` | money-weighted return via numerical root-finding; STCG/LTCG tax from a JSON ruleset |
| `debt_calculator` | EMI amortization + avalanche/snowball payoff simulation |
| `insurance_advisor` / `insurance.ts` | life (10× income) & health (₹5L floor) coverage gaps |
| `safety_net` / `safetyNet.ts` | one readiness score over emergency fund + insurance + safe assets |
| `sync_merge` / `syncMerge.ts` | deterministic last-write-wins merge for backups |

Because these are pure, they are covered by ~1,800 lines of Dart tests and a
growing Vitest suite — and **parity is enforced by mirrored tests** (the same
fixtures and expected outputs on both sides).

---

## 6. State & screens (the outer rings)

- **Web**: a single **Zustand** store (`store.ts`) is the whole session — vault
  status, the in-memory key, all entity arrays, theme/accent/currency, and the
  actions (`unlock`, `put`, `del`, `exportBackup`, …). Screens under
  `src/app/*` are `'use client'` App-Router routes; `npm run build` emits a fully
  **static export** (no Node server). UI uses hand-built primitives (`ui.tsx`:
  `Ring`, `Donut`, `Sparkline`, `GlassCard`…) to avoid heavy chart deps.
- **Flutter**: **Riverpod** providers expose repository-backed streams; `go_router`
  with a `ShellRoute` + bottom nav (`lib/presentation/app_shell.dart`) drives
  navigation. Screens read providers and render Material/glassmorphism widgets.

---

## 7. Multi-device sync, without a server

Two devices can reconcile their **encrypted backups** with no coordinator.
`sync_merge.dart` / `syncMerge.ts` implement **last-write-wins** keyed on each
record's `updatedAt`, with **tombstones** (soft-delete markers) retained 90 days
so a delete on one device propagates instead of being resurrected. The function
is **symmetric** — it runs identically on both peers — and is unit-tested
(`webapp/scripts/sync-merge.test.ts`).

---

## 8. Worked example: the Safety Net score

This ties every ring together. When you open **Safety Net**:

1. **State** — the page reads `txns`, `goals`, `insurances`, `holdings` from the
   store (web: `useApp(...)`; Flutter: `safetyNetProvider` in
   `lib/features/safety_net/providers/`). Those came from §3d (decrypted in
   memory).
2. **Domain** — it calls the pure `safetyNet(...)` function
   (`webapp/src/domain/safetyNet.ts` ↔ `lib/domain/services/safety_net.dart`),
   which:
   - reuses `windowSummary` to get a 3-month average monthly expense,
   - reuses `coverageGaps` / `annualPremiumTotal` for life & health cover,
   - sums FD/PPF·EPF/NPS holdings as "safe assets",
   - and combines four pillars (weights 35/25/25/15) into a 0–100 score + grade.
3. **Presentation** — the page renders a readiness ring, per-pillar progress
   bars, and guidance; ghost mode masks the amounts.

Because the Dart and TS versions are the same algorithm, both apps show the
**same score for the same data** — asserted by `test/unit/safety_net_test.dart`
and `webapp/src/domain/safetyNet.test.ts` (both expect 100 / 25 / 50 / 85 on the
shared fixtures).

---

## 9. Build, run, test

```bash
# Flutter
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # Drift/json codegen
flutter run            # or: flutter test --exclude-tags golden

# Web
cd webapp
npm ci
npm run dev            # http://localhost:3000
npm run test           # Vitest (domain + RTL component tests)
npm run build          # static export → webapp/out/
```

CI (`.github/workflows/ci.yml`) runs both stacks on every push/PR: tests and the
static build are hard gates; lint is advisory. Benchmarks are reproducible via
`node webapp/scripts/bench-crypto.ts` and
`flutter test test/benchmark/crypto_fts_bench_test.dart`.

---

## 10. What it deliberately is NOT

State this plainly — it's a design choice, not a gap:

- **No backend / API / server auth** (no JWT/OAuth/RBAC, no CORS/CSRF surface) —
  there is nothing to attack on a network because there is no network.
- **No PIN recovery** — forget the PIN, lose the data. A zero-knowledge
  trade-off (see [THREAT-MODEL.md](THREAT-MODEL.md)).
- **No cloud, no telemetry** — logging is local and redacted.

The strength here is **applied client-side cryptography + financial-domain
modeling + cross-platform parity**, not infrastructure or web-auth.
