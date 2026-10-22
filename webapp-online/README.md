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
3. Open http://localhost:3100 and use **Development sign-in** with any
   `dev:` subject.

## What is here (scaffold)

| Path | What it does |
|---|---|
| `src/lib/dpop.ts` | DPoP proofs (RFC 9449) signed with a non-extractable P-256 key |
| `src/lib/vault.ts` | This app's IndexedDB: the device key and the refresh token |
| `src/lib/api.ts` | Gateway client: sign-in, signed calls, refresh rotation, sign-out |
| `src/app/` | Sign-in, and a home with empty Accounts, Cards and Connections |
| `scripts/headers.mjs` | Generates `out/_headers`; the CSP allows this site and the gateway only |

Coming next (Phase 2 client slice): device keys and pairing (ADR 0005),
encrypted sync (ADR 0006), and the read-mostly views.

## Build settings

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_GATEWAY_URL` | The gateway this build talks to (https, or http://localhost) |
| `NEXT_PUBLIC_DEV_SIGN_IN` | `true` shows the development sign-in; never set it in production |

`npm test` runs the unit tests, including `scripts/separation.test.ts`, which
fails if this app imports the offline app or opens its database.
