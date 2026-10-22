# ADR 0003 — Free first, paid later, behind adapters (decision D15)

- **Status:** accepted (2026-10-18)

## Context
v2 is built and tested by one developer and a few friends before any paid
service (Account Aggregator, credit bureau, price vendors, cloud) is worth its
cost.

## Decision
Every external dependency sits behind an interface chosen by configuration
(`Providers:*`). Free or sample adapters now; paid adapters later, swapped by
configuration, verified by one contract-test suite per interface.

## Consequences
- First instance: `INavSource` with `AmfiNavSource` (real, free) and
  `FixtureNavSource` (development and tests).
- **A startup guard refuses any fixture or mock adapter in Production**, so
  sample data can never be served as real.
- Local development costs nothing: Aspire runs Postgres and RabbitMQ in Docker.
