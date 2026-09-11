# Khazana — Offline-First, Encrypted Personal Finance Engine

**[Try it in your browser →](https://khazana-app.netlify.app)** · no signup, no
install, no data leaves your device — the link *is* the whole app.
&nbsp;·&nbsp; **[Technical case study →](docs/Khazana_Technical_Case_Study.pdf)**
&nbsp;·&nbsp; [Architecture](docs/ARCHITECTURE.md)
&nbsp;·&nbsp; [Threat model](docs/THREAT-MODEL.md)

Khazana is a **privacy-total, serverless** personal-finance app. All data lives
**encrypted at rest on the user's device** — there is no backend, no cloud
database, and no account server by design. It ships as **two parallel client
apps that share the same domain logic**:

- **Flutter app** (iOS / Android / macOS) — Dart, Riverpod, go_router, Drift ORM
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

Built solo. The web app is **live and usable today** (link at the top); the
mobile builds are in release preparation, where the critical path is Google
Play's twelve-tester, fourteen-day closed test for individual publishers rather
than anything in the code. **No production users yet, and no backend — the
second one permanently.**

Khazana is free with no limits on the ledger; **Khazana Pro** is a one-time
purchase, never a subscription. Backup, restore, CSV export and "erase all data"
are free forever and are asserted as an invariant by the test suites on both
clients — see [`docs/pro-gates.json`](docs/pro-gates.json), which is the single
source of truth both clients load so they cannot drift about what money buys.

The security story is applied client-side cryptography (see the
[threat model](docs/THREAT-MODEL.md)), not web-auth or infrastructure security.

**Known limitations**, kept in the open rather than discovered by a user:
[`docs/APP-INVENTORY.md` §7](docs/APP-INVENTORY.md#7-defects) is a numbered
defect log that names what is broken and what has been fixed. Currently open:
no dedicated transaction-edit screen on Flutter, no pagination anywhere, and
`react-hooks/purity` lint debt under Next 16's ruleset — CI runs lint as an
advisory step while tests and the static build are hard gates.
