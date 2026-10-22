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
| `building-blocks/Khazana.Security/` | DPoP proof checks and `AddKhazanaAuthentication` for every service that serves a signed-in user |
| `services/MarketData/` | Domain → Application → Infrastructure → Api, plus Tests |
| `services/Identity/`, `Devices/`, `Sync/`, `Notification/`, `AuditReporting/`, `Catalog/` | The same five folders |
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
