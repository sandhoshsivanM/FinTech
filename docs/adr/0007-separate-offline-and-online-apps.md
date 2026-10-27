# ADR 0007: Khazana Offline and Khazana Online are separate apps

- **Status:** accepted (2026-10-22). Supersedes the "one app with an online
  layer" model in design doc §2–§5 and §15.

## Context
The v2 design added accounts, sync and the backend to the existing apps: a
user who never signed in would get v1 behaviour, and one who did would get
an online layer. That model mixes two different products:

- an app that needs no account, holds everything on the device and never
  talks to our servers;
- an app built around an account, end-to-end encrypted sync between devices,
  and the Phase 2 services.

Keeping both in one codebase makes it easy for the offline app to gain
network, account or server dependencies without anyone deciding it should.

## Decision
- **Four apps, two products:**

  | | Khazana (offline) | Khazana Online |
  |---|---|---|
  | Web | `webapp/` → khazana-app.netlify.app | `webapp-online/` → its own Netlify site |
  | Mobile | Flutter app at the repo root, `com.khazana.app` | `mobile-online/`, `com.khazana.online`, its own store listings |

- **The offline apps never gain an account, a login, sync or calls to our
  backend.** They keep their direct public price feeds (the Yahoo relay, AMFI,
  FX) and their file-based backup and merge (`syncMerge`). Guard tests in each
  offline app fail the build if backend or auth code appears.
  - *Amended 2026-10-26:* "file-based merge" includes **folder sync**. Each
    device writes one encrypted `.khazana-sync` file into a folder the user
    owns (iCloud Drive, Dropbox) and merges the others' with `syncMerge`.
    There is no account, no Khazana server and no network call; the folder's
    own service carries ciphertext only. A guard test fails the build if the
    sync code opens a connection.
- **The backend serves the online apps only.** Identity, Devices, Sync,
  Notification, Catalog, MarketData and Reporting have no offline client.
- **Sharing is build-time only.** Pure domain logic and design tokens live in
  `packages/` (`khazana_domain` for Dart, `domain-ts` for TypeScript) and are
  compiled into each app. So do the Zentra web components and their
  stylesheet (`ui-ts`, imported as `@khazana/ui`): props and tokens in, markup
  out, with no store, storage or network. There is no runtime link, no shared storage and no
  shared origin. Each online app has its own database (`khazana_online`).
- **Moving data between the products is a file:** export a `.ftos` backup from
  one, import it into the other. Nothing else crosses over.
- **Separate releases:** separate CI jobs, Netlify sites, store listings,
  version numbers and tag prefixes (`v*` offline, `online-v*` online).

## Consequences
- Each product can be understood, reviewed and shipped on its own. The offline
  app's promise ("no server") stays checkable by a test, not by discipline.
- ~~The UI is built twice where both products need a screen.~~ Superseded by
  the 2026-10-27 amendment below: screens are shared at build time.
- Two store listings and two web addresses to explain to users. The offline
  app stays free with no paywalls; the online app's cost model is D13.
- **Open items:**
  - Naming and listing copy for Khazana Online.
  - Which on-device features (SMS and notification capture, the Review
    inbox, OCR, on-device Gmail) Khazana Online also gets, and which server
    features (Account Aggregator, credit report) stay online only. Decided
    phase by phase; the offline app keeps every on-device feature it has.
  - Whether the online app also offers a local-only mode. By this decision,
    it doesn't: local-only is the offline app.

## Amendment 2026-10-27: the apps may share screens

The user approved sharing the screens themselves, so the online app renders the
exact same pages as the offline app instead of rebuilding each one.

- The apps stay separate products: separate sites, store listings, data,
  builds and release tags. **The offline app still never talks to a server.**
  Nothing about the four-app table, the guard tests or the `.ftos` file
  hand-off changes.
- Screens MAY be shared through `packages/screens-ts`, imported as
  `@khazana/screens` and compiled into each app like `domain-ts` and `ui-ts`.
- The package contains **no storage and no network**: no Dexie or IndexedDB, no
  `fetch`, no vault data in `localStorage`, no Tauri. A screen reads and writes
  through the `KhazanaStore` contract (the data entities plus `put`, `putMany`,
  `del`, `reload` and the other CRUD actions, active profile, currency, theme and
  accent). Each app injects its own implementation through
  `KhazanaStoreProvider`: the offline app passes its encrypted Dexie-backed
  store, the online app passes one backed by its own database and sync.
- Platform-specific behaviour (saving a file through Tauri, notifications, the
  tour) is injected through small adapters. Defaults are plain-browser ones.
- Vault-only concerns (PIN, lock, backup, wipe, folder sync, persistence,
  stranded and unreadable records) and the Settings, Capture and Diagnostics
  screens stay in `webapp/`.
- Still banned: a direct import of a `/webapp/` or `/webapp-online/` path from
  either app or from the package, and the offline database name
  (`fintech_os`) anywhere in the online app or the package. Guard tests in both
  apps scan `packages/screens-ts` for these.
