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
- The UI is built twice where both products need a screen. Shared domain code
  and tokens keep the numbers and the look the same; screens are not shared.
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
