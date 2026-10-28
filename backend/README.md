# Khazana backend (v2, online)

.NET 10 microservices behind one gateway. Design:
`docs/Khazana_v2_Technical_Design.pdf` §7–§8.

| Service | Slice | What it does |
|---|---|---|
| Market Data | 2.1 | Public mutual-fund NAVs as whole-day files (no user data) |
| Identity | 2.2 | Sign-in (Google, Apple, passkeys), DPoP-bound tokens, refresh rotation, logout, deletion request (ADR 0004) |
| Devices & Keys | 2.3 | Device registry, end-to-end key envelopes (ciphertext only), QR pairing, recovery, remote logout (ADR 0005) |
| Sync | 2.4 | Encrypted records in and out by per-user sequence; never merges, never reads (ADR 0006) |
| Notification | 2.5 | Push tokens; data-free sync nudges and new-device alerts over FCM / APNs (log-only in development) |
| Audit & Reporting | 2.6 | Directory, sign-ins and a hash-chained, append-only audit log, built only from events (no PII) |
| Catalog | 2.7 | Card offers and parser templates, published as an Ed25519-signed snapshot (libsodium) |
| Account Aggregator | 4 | Consents, the fetch saga, signed partner callbacks; bank data sealed to the user's delivery key in an inbox (ADR 0008). Sample AA until a partner exists |
| Credit | 5 | Credit-report pulls with explicit consent, one per 30 days; reports sealed to the user's key; only "a pull happened" is stored (ADR 0008). Sample bureau for now |
| Admin (Blazor) | 2.6 | Internal panel: dashboard, directory, audit log; reads only Audit & Reporting; every view audited |

## Run it locally

1. Start **Docker Desktop** (Postgres and RabbitMQ run in containers).
2. From the repo root:

   ```bash
   dotnet run --project backend/Khazana.AppHost --launch-profile http
   ```

   Aspire starts Postgres, RabbitMQ, Market Data and the gateway, and prints a
   dashboard login URL (http://localhost:15180) with logs, traces and metrics
   for every service.
3. Load the sample NAVs and read them through the gateway:

   ```bash
   curl -X POST http://localhost:5081/internal/market/nav/ingest   # service, dev only
   curl -s --compressed http://localhost:5196/v1/market/nav/latest  # gateway
   ```

4. Sign in through the gateway. Every call needs a DPoP proof signed by a
   device key, so `curl` alone can't do it. The integration tests and
   `tests/Khazana.TestKit` (`DeviceKey`, `SoftwareAuthenticator`) show the
   exact requests. In Development the `dev` provider accepts
   `id_token: "dev:<anyone>[:<email>]"` in place of Google or Apple.

Bank data and credit reports come from sample adapters (`Providers__AccountAggregator=Fake`,
`Providers__Credit=Fake`), which approve consents on the first status check and
return the same realistic data for the same user or PAN. Both are refused in
Production.

### Account Aggregator: Setu sandbox

`Providers__AccountAggregator=Setu` runs the Setu AA gateway adapter
(`SetuBankDataProvider`) against Setu's **sandbox** by default
(`https://fiu-sandbox.setu.co`). Setu does the AA protocol for us (consent
artefact, the key exchange with the bank, decryption) and returns FI data as
JSON; the adapter normalises it, and the saga seals it to the user's delivery
key like any other payload. Setu's sandbox serves mock banks and data only.

Sign up (free, about 15 minutes):

1. Create an account on Setu's Bridge: https://bridge.setu.co/v2/signup.
2. Create an **FIU** (basic details), then add the **Account Aggregator** data
   product under it.
3. Configure it: consent template (purpose 102, consent types profile,
   summary and transactions; FI types deposit, term and recurring deposit,
   mutual funds, equities, ETF, NPS, insurance), branding, account discovery.
4. Notifications: set the URL to `https://<API_HOST>/v1/webhooks/aa`. Optional:
   without it the fetch saga polls every two minutes.
5. Credentials: the product page then shows `x-product-instance-id`,
   client id (`x-client-id`) and client secret. Keep them out of git.

Configure (environment variables only; nothing is committed):

| Variable | Value |
|---|---|
| `Providers__AccountAggregator` | `Setu` |
| `Providers__Setu__ClientId` | Bridge client id |
| `Providers__Setu__ClientSecret` | Bridge client secret |
| `Providers__Setu__ProductInstanceId` | Bridge product instance id |
| `Providers__Setu__RedirectUrl` | where Setu returns the user: the web app's `/link/` page, e.g. `https://khazana-online.netlify.app/link/` |
| `Providers__Setu__Auth` | `Token` (default: the id and secret are exchanged for a bearer token at `Providers__Setu__TokenUrl`, default `https://orgservice-prod.setu.co/v1/users/login`), or `Headers` if your product takes `x-client-id`/`x-client-secret` on each call |
| `Providers__Setu__BaseUrl` | defaults to the sandbox; `https://fiu.setu.co` for production |

In the demo the same values go in `deploy/demo/.env` as `AA_PROVIDER=Setu`,
`SETU_CLIENT_ID`, `SETU_CLIENT_SECRET`, `SETU_PRODUCT_INSTANCE_ID` (and
`SETU_AUTH=Headers` if needed); the redirect is `${WEB_ORIGIN}/link/`.

Guards, at startup: Setu without its three credentials stops the service and
names what is missing; every URL must be https (the redirect may be plain http
only to a loopback address); **Production refuses Setu's sandbox host**, as it
refuses `Fake`.

Testing in the sandbox: in the web app, Settings → Link bank & investments,
enter a 10-digit mobile number (Setu's AA screen sends an OTP to it) and link.
You are sent to Setu's consent screen. Pick **Setu FIP-2**, whose OTP is the
static `123456` (Setu FIP sends a real OTP to the number). Approve, and you come
back to `/link/`, which waits for the consent, fetches and imports. Setu's docs:
https://docs.setu.co/data/account-aggregator.

Callbacks: Setu's notifications are not signed (as documented), so the adapter
treats them as hints. A consent notification makes the service re-read the
status from Setu's authenticated API; a session notification makes the saga
collect sooner. A forged callback changes nothing.

Local runs read `contracts/fixtures/amfi/navall_sample.txt`, never AMFI. To try
the real file, set `Providers__Nav=Amfi` on `marketdata-api` in
`Khazana.AppHost/AppHost.cs`.

## Test

```bash
cd backend
dotnet test --solution Khazana.slnx
```

Unit, architecture and gateway tests, plus integration tests against real
Postgres and RabbitMQ containers (needs Docker running).

## Layout

| Path | What it is |
|---|---|
| `Khazana.AppHost/` | .NET Aspire: runs everything locally |
| `Khazana.ServiceDefaults/` | Telemetry, health checks, service discovery, resilient HTTP |
| `Khazana.Gateway/` | YARP: the only public entry point (routes, GET-only, rate limits, security headers) |
| `building-blocks/Khazana.Messaging/` | Versioned event contracts + the one place messaging is configured |
| `building-blocks/Khazana.SharedKernel/` | Clock, IST time |
| `building-blocks/Khazana.Crypto/` | Sealing to a user's delivery key (libsodium sealed box) for AA and Credit payloads |
| `building-blocks/Khazana.Security/` | DPoP proof checks and `AddKhazanaAuthentication` for every service that serves a signed-in user |
| `services/MarketData/` | Domain → Application → Infrastructure → Api, plus Tests |
| `services/Identity/`, `Devices/`, `Sync/`, `Notification/`, `AuditReporting/`, `Catalog/`, `AccountAggregator/`, `Credit/` | The same five folders |
| `services/Admin/` | The admin panel (Blazor, static server rendering), http://localhost:5090 locally |
| `tests/` | Architecture rules, gateway tests, DPoP tests, and the shared TestKit |

## Rules worth knowing

- **Warnings are errors**, package versions are pinned centrally
  (`Directory.Packages.props`, including transitive ones).
- **Only contracts cross the broker.** Types in `Khazana.Messaging.Contracts`
  go over RabbitMQ; a service's internal commands stay on its own durable local
  queue (ADR 0002).
- **Outbox everywhere.** A handler's database writes and outgoing events commit
  in one transaction; `IngestNav` refuses to run outside one.
- **Free first** (ADR 0003): paid or external services sit behind interfaces
  chosen by `Providers:*`; sample data is refused in Production.
- **DPoP, never Bearer.** Signed-in endpoints call `RequireAuthorization()`
  after `AddKhazanaAuthentication`. A token without a fresh proof from its
  device key is refused (ADR 0004).
- **Pub/sub, one queue per service per event.** Every service that handles an
  event has its own queue `<service>.<event>` bound to the event's exchange,
  so each gets every event (`tests/Khazana.Messaging.Tests` proves it across
  hosts). Transient database conflicts are retried three times, then
  dead-lettered.
- **Before production: pre-generate Wolverine's handler code.** Today
  handlers are compiled at startup (`WolverineFx.RuntimeCompilation`). For the
  cloud, add `JasperFx` command support to each service, run
  `dotnet run -- codegen write` in CI, and set
  `opts.CodeGeneration.TypeLoadMode = TypeLoadMode.Static` outside
  Development: faster starts and no compiler in the container.
- **Shared replay cache.** DPoP proofs are remembered in each service's own
  Postgres (`security.dpop_replay`), so a proof can't be replayed on another
  instance.
- **Rate limits behind a balancer.** Set `Gateway:TrustedProxies` (IPs or
  CIDRs) to the load balancer; only then is `X-Forwarded-For` honoured. A
  global per-address ceiling (`RateLimits:Global`) sits on top of every route.
- **No secrets in the repo.** Aspire generates Identity's field-encryption key
  into the AppHost's user secrets. Production reads it, and the PEM signing
  key, from the secret store; startup refuses the development stand-ins.

## Migrations

```bash
cd backend
dotnet ef migrations add <Name> --project services/<Service>/Khazana.<Service>.Application \
  --startup-project services/<Service>/Khazana.<Service>.Api --output-dir Persistence/Migrations
```

`dotnet-ef` is a repo-local tool (`dotnet tool restore`). Migrations run at
startup in Development only; in the cloud they will be a separate deploy step.
