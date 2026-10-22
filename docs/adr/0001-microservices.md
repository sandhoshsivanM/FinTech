# ADR 0001 — Microservices for the v2 backend

- **Status:** accepted (2026-10-18)
- **Decision maker:** Sandhoshsivan M

## Context
Khazana v2 adds an online layer (login, sync, bank data). A modular monolith
would be simpler to run at this scale. The project is also the developer's
vehicle for learning microservices hands-on.

## Decision
Build the backend as coarse-grained .NET 10 microservices behind a YARP
gateway, each with its own database, talking through RabbitMQ events
(design doc §7.2 lists the ten services). Run everything locally with .NET
Aspire.

## Consequences
- Costs accepted: about 3–4 extra months, more moving parts, higher hosting
  (₹5–12 L/yr vs ₹3–8 L at 10k users).
- Mitigations: Aspire for one-command local runs; OpenTelemetry traces with one
  id across every hop; shared building blocks written once; contract and
  architecture tests; every service starts as one database on one shared RDS
  instance.
- Boundaries are enforced by `tests/Khazana.ArchitectureTests`, not by memory.
