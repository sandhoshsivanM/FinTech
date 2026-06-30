# Khazana — Offline-First, Encrypted Personal Finance Engine

Khazana is a **privacy-total, serverless** personal-finance app. All data lives
**encrypted at rest on the user's device** — there is no backend, no cloud
database, and no account server by design. It ships as **two parallel client
apps that share the same domain logic**:

- **Flutter app** (iOS / Android / Web) — Dart, Riverpod, go_router, Drift ORM
  over **SQLCipher (AES-256)** encrypted SQLite.
- **Next.js web app** (`webapp/`) — React 19, TypeScript, Zustand, Dexie /
  IndexedDB, **Web Crypto AES-256-GCM**, optionally packaged as a desktop app
  with **Tauri 2**.

The financial **domain layer is framework-free** and deliberately ported between
Dart and TypeScript so both apps compute the same numbers. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## Highlights

- **Encryption at rest on both platforms** — SQLCipher (mobile) and Web Crypto
  AES-256-GCM (web), keyed by **PBKDF2-HMAC-SHA256 @ 600,000 iterations**, with
  biometric unlock and in-memory key purge on lock.
- **Framework-free financial engine** — financial-health score, net worth, XIRR,
  EMI / debt-payoff (avalanche & snowball), a config-driven capital-gains tax
  engine, insurance coverage-gap analysis, and a **Safety Net** readiness score.
- **Encrypted SQLite data layer** — Drift ORM, 13 tables, FTS5 full-text search,
  versioned schema migrations; money stored as `Decimal`/TEXT (no float error).
- **Serverless sync** — deterministic last-write-wins merge with 90-day
  tombstones for reconciling encrypted backups across devices.

## Repository layout

| Path | What |
|---|---|
| `lib/` | Flutter app — `domain/` (pure logic), `data/` (Drift/SQLCipher), `features/`, `core/`, `presentation/` |
| `webapp/` | Next.js web app — `src/domain/` (TS port), `src/lib/` (crypto, store, Dexie), `src/app/` (routes), `src/components/` |
| `test/` | Flutter unit / integration / golden / benchmark tests |
| `docs/` | Architecture and threat-model docs |
| `.github/workflows/` | CI (lint + tests + build, both stacks) |

## Run it

**Flutter app**

```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # Drift/json codegen
flutter run            # or: flutter test
```

**Web app**

```bash
cd webapp
npm ci
npm run dev            # http://localhost:3000
npm run test           # Vitest (domain + component tests)
npm run build          # static export to webapp/out/
```

## Benchmarks

Performance numbers are **measured**, not asserted from a spec — via committed
scripts:

```bash
node webapp/scripts/bench-crypto.ts                          # PBKDF2 + AES-GCM
flutter test test/benchmark/crypto_fts_bench_test.dart       # PBKDF2 + FTS5
```

See the results table in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#measured-performance).

## Status & scope

Solo portfolio project. **No backend, no CI-deployed environment, no production
users.** The security story is applied client-side cryptography (see the threat
model), not web-auth/infrastructure security. The web app's lint currently
carries pre-existing `react-hooks/purity` debt under Next 16's ruleset; CI runs
lint as an advisory step while tests and the static build are hard gates.
