# Khazana Online — web

Khazana with an account: the same money on every device, end-to-end
encrypted. This is a **separate app** from the offline Khazana in `webapp/`
(ADR 0007): its own code, storage (`khazana_online` IndexedDB), build and
Netlify site. It never imports the offline app; shared domain logic and design
tokens come from `../packages/domain-ts` at build time.

## Run it locally

1. Start the backend: `dotnet run --project backend/Khazana.AppHost --launch-profile http`.
   The gateway listens on `http://localhost:5196` and allows this app's dev
   origin (`Gateway:AllowedOrigins`).
2. In this folder: `npm ci`, then `NEXT_PUBLIC_DEV_SIGN_IN=true npm run dev`.
3. Open http://localhost:3100 and **Create account with a passkey** (the
   AppHost allows passkeys for `localhost:3100`), or use the development
   sign-in.

## What is here (scaffold)

| Path | What it does |
|---|---|
| `src/lib/dpop.ts` | DPoP proofs (RFC 9449) signed with a non-extractable P-256 key |
| `src/lib/vault.ts` | This app's IndexedDB: the device key and the refresh token |
| `src/lib/api.ts` | Gateway client: sign-in, signed calls, refresh rotation, sign-out |
| `src/app/` | Sign-in, and a home with empty Accounts, Cards and Connections |
| `src/lib/passkey.ts` | Passkey ceremonies (create account, sign in) with the browser's WebAuthn JSON helpers |
| `src/lib/crypto/` | End-to-end formats: device envelopes, recovery phrase, key check, records (pinned by `contracts/crypto/vectors.json`) |
| `src/lib/keys.ts` | This device's key: register, unlock, create (24 words), recover, pair and approve |
| `src/app/setup/`, `src/app/pair/` | First-device setup, linking a device (pair or phrase), approving a pairing |
| `scripts/headers.mjs` | Generates `out/_headers`; the CSP allows this site and the gateway only |

| `src/lib/sync/engine.ts` | Encrypted sync: outbox, pull pages, last write wins, tombstones, reset after a purge (ADR 0006) |
| `src/lib/ledger.ts`, `src/lib/store.ts` | Accounts and transactions as encrypted records; live state and when sync runs |
| `src/app/home/`, `src/app/account/`, `src/app/how/` | Accounts, transactions, and “How it works” (what the server stores vs what this device reads) |

| `src/lib/devices.ts`, `src/app/settings/` | Settings: devices (list, rename, remove with a passkey check) and a "Connections, coming later" placeholder |

Not yet: cards, connections (placeholder only), attachments, key rotation after a device is removed (see ADR 0005).

## Build settings

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_GATEWAY_URL` | The gateway this build talks to (https, or http://localhost) |
| `NEXT_PUBLIC_DEV_SIGN_IN` | `true` shows the development sign-in; never set it in production |

`npm test` runs the unit tests, including `scripts/separation.test.ts`, which
fails if this app imports the offline app or opens its database.
