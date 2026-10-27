# ADR 0008: Bank data and credit reports reach the app sealed, through an inbox

- **Status:** accepted (2026-10-27)

## Context
Account Aggregator (AA) data and credit reports have to come through a
server. The AA protocol delivers financial data to the FIU's server key, and
bureau APIs need server credentials (design doc §6, §8.5, §8.6). The rule
for the server is still P2: no readable financial data stored on it. Both
services are consent-driven by law (RBI AA framework, DPDP Act 2023).

## Decision
- **Sealed to the user's delivery key.** The app makes one X25519 *delivery*
  key pair per user. The private half is kept like the data key, wrapped and
  synced only between the user's devices. The app sends the public half with
  each consent request (`POST /v1/aa/consents`) and each credit pull
  (`POST /v1/credit/report`).
  - The server seals each payload with libsodium's `crypto_box_seal`
    (`x25519-sealedbox-v1`, the same primitive as device envelopes, ADR 0005).
    It can write data for the user but can't read it back.
  - The plaintext envelope carries `payload_id` and `kind`. The app checks
    them against the inbox entry, so a swapped payload is caught.
  - Code: `building-blocks/Khazana.Crypto`.
- **Plaintext only in memory.** The provider adapter returns normalised data
  (`FiBundle`, `CreditReport`). The handler serialises it, seals it and wipes
  the serialised bytes in one step. Nothing readable is logged or stored.
  PAN and mobile go to the bureau call only, and request records redact them
  from `ToString`.
- **Inbox, then gone.** `GET /v1/aa/inbox` and `GET /v1/credit/inbox` list
  sealed payloads, ten at a time. `POST …/inbox/{id}/ack` deletes one.
  Payloads also go when:
  - nobody collects them in 14 days;
  - the consent ends (revoked here or at the AA, expired, rejected), and
    credit consent is withdrawn (`DELETE /v1/credit/consent`);
  - the account is deleted.
- **Consent gates every fetch.** An AA fetch needs an `active`, unexpired
  consent belonging to the caller. Every step of the fetch saga checks this
  again, so a consent revoked mid-fetch stops it before anything is
  collected.
  - A credit pull needs `consent_accepted: true` and a current consent text
    version (`Credit:ConsentTextVersions`). The version is stored with the
    pull.
  - One successful credit pull per 30 days. Failed pulls don't count.
- **Fetch saga** (AA), persisted in `aa_fetch_sagas`:
  - `requested → fetching → sealed → delivered`, or `failed` / `expired`.
  - Transient partner errors are retried three times with backoff (1, 5 and
    15 minutes). Decrypt errors fail at once.
  - A partner callback and the fallback poll can't both seal one fetch: the
    saga row is locked, and only one fetch per consent can be in flight.
- **Partner callbacks** (`POST /v1/webhooks/aa`) are anonymous but must be
  signed. The adapter checks the signature and the timestamp window, and the
  endpoint answers 401 otherwise. The sample adapter uses HMAC-SHA256. The
  partner adapter will verify the partner's detached JWS.
- **Free first** (ADR 0003): `IBankDataProvider` (`Providers:AccountAggregator`)
  and `ICreditReportProvider` (`Providers:Credit`) ship with deterministic
  sample adapters (`Fake`). Startup refuses `Fake` in Production. The Finvu
  adapter is a TODO stub that stops startup if selected. No bureau adapter is
  chosen yet.
- **Events, ids only:**
  - AA publishes `ConsentActivatedV1`, `ConsentRevokedV1` (status),
    `PayloadSealedV1` and `AaFetchFailedV1`.
  - Credit publishes `CreditReportReadyV1` and `CreditConsentWithdrawnV1`.
  - Reporting audits them. Notification sends the silent sync nudge.
  - Both services take part in the deletion saga as `aa` and `credit`. AA
    also revokes every open consent at the partner, as a retried message, so
    a partner outage can't hold the purge up.

## What the server stores, and why
| Store | What | Why |
|---|---|---|
| `aa.aa_consents` | partner, consent handle, status, FI types, frequency, data window, expiry, the delivery **public** key, times | To run and end the consent; a public key can only seal |
| `aa.aa_fetch_sagas` | state, attempts, error code, cost units, partner session id, data window | Restart-safe saga and partner spend; no data |
| `aa.inbox_payloads`, `credit.inbox_payloads` | sealed bytes, kind, alg, expiry | Until the app collects them; unreadable by the server |
| `credit.credit_pulls` | provider, status, consent text version, purpose, times, error code | The record that a pull happened, under which consent (§8.6). Never the report, score, PAN or mobile |

## Consequences
- **Metadata is visible to the server:**
  - which FI types a user consented to;
  - when fetches and pulls happen;
  - payload sizes;
  - partner cost units.
- If the user loses every device and the recovery phrase, uncollected
  payloads can't be opened. That is by design.
- A new delivery key pair needs a new consent. Rotating the key on an
  existing consent is not built.
- The design's single `/v1/inbox` that fans out to both services is not
  built. The app calls `/v1/aa/inbox` and `/v1/credit/inbox`, and the gateway
  stays a plain proxy.
- **Large payloads:** `inbox_payloads` holds the sealed bytes, up to 8 MB per
  fetch. The design's `s3_key` option for larger payloads comes with
  `IBlobStore`.
