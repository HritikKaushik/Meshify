---
title: packages/data-access
purpose: The only place that talks to Postgres — entities, repository ports, Postgres implementations, and migrations.
audience: Backend engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-14
related:
  - ../../docs/architecture/data-model.md
---

# @meshify/data-access

The data layer. All SQL lives here; the rest of the system depends on the
repository **ports**, not the implementations.

## Purpose & responsibilities
- Define domain **entities** (`*.entity.ts`) and repository **ports** (`*.repository.ts`).
- Provide Postgres implementations (`postgres-*.repository.ts`) — all queries parameterized.
- Own the **migrations** (`migrations/*.sql`) and the migrate runner (`src/migrate.ts`).
- Own provisioning helpers (org secret encryption, Clerk-org links, API-key hashing).

## Public API
Barrel `src/index.ts` exports entities, port interfaces, `Postgres*Repository`
classes, and helpers (`hashApiKey`, `qdrantCollectionName`, `encryptSecret`, …).

## Dependencies
`@meshify/config`, `pg`.

## Consumers
`apps/{platform-api,bff,worker,observability}`, `@meshify/testing` (types for the in-memory mocks).

## How to extend
Add a port method → implement in the Postgres class → (schema change) add a
**new** numbered migration. Never edit an applied migration. See
[Data Model](../../docs/architecture/data-model.md).

## How to test
Unit-test consumers with `@meshify/testing` in-memory repos. The Postgres
implementations are integration-tested against a real database (Testcontainers —
see [`TESTING.md`](../../TESTING.md)).

## How to debug
- `pnpm migrate` applies pending migrations (`src/migrate.ts`).
- Every table is `project_id`/`org_id`-scoped with `ON DELETE CASCADE`.

## Key files
`src/**/*.entity.ts`, `src/**/*.repository.ts`, `src/**/postgres-*.repository.ts`, `migrations/*.sql`, `src/migrate.ts`.

---
[← Handbook](../../docs/README.md)
