# ADR 0002 — Wolverine for messaging (decision D14)

- **Status:** accepted (2026-10-22)

## Context
Services need a transactional outbox, idempotent consumers and sagas on
RabbitMQ and Postgres. MassTransit v9 moved to a commercial licence in 2025;
v8 stays open source but would pin us to an old line.

## Decision
Use **Wolverine** (MIT): RabbitMQ transport, Postgres message storage, EF Core
transactions. Configured once in `building-blocks/Khazana.Messaging`.

## Consequences
- Outbox and inbox come built in; a handler's writes and outgoing messages
  commit together (`AutoApplyTransactions` + EF Core integration).
- **Only `Khazana.Messaging.Contracts` types cross the broker**
  (`UseConventionalRouting(IncludeTypes(IsContract))`). Found while testing:
  by default Wolverine also put the internal `IngestNav` command on RabbitMQ,
  where anything with broker access could trigger it.
- Wolverine 6 no longer ships its runtime compiler: services reference
  `WolverineFx.RuntimeCompilation` for now. **Before the first deployment,
  switch to pre-generated static handler code** (no Roslyn in the image,
  faster startup).
