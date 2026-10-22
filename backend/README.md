# Khazana backend (v2, online)

.NET 10 microservices behind one gateway. Phase 2, Slice 2.1: the platform
itself, proven on the first service, **Market Data** (public mutual-fund NAVs —
no user data). Design: `docs/Khazana_v2_Technical_Design.pdf` §7–§8.

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
| `services/MarketData/` | Domain → Application → Infrastructure → Api, plus Tests |
| `tests/` | Architecture rules and gateway tests |

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
- **No auth yet** — Market Data is public data. JWT + DPoP arrive with the
  Identity service (next slice), before any user data exists.

## Migrations

```bash
cd backend
dotnet ef migrations add <Name> --project services/MarketData/Khazana.MarketData.Application \
  --startup-project services/MarketData/Khazana.MarketData.Api --output-dir Persistence/Migrations
```

`dotnet-ef` is a repo-local tool (`dotnet tool restore`). Migrations run at
startup in Development only; in the cloud they will be a separate deploy step.
