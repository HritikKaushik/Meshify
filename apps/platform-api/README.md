---
title: apps/platform-api
purpose: The core Meshify API — projects, documents, repositories, chat, search, evaluation.
audience: Backend engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-14
related:
  - ../../docs/architecture/backend.md
  - ../../docs/backend/auth.md
---

# @meshify/platform-api

The core HTTP API. Clean-architecture modules, API-key authenticated, project-isolated.

## Purpose & responsibilities
- Own the domain endpoints: `projects`, `documents`, `repositories`, `chat`, `search`, `evaluation`, `jobs`, `health`.
- Enforce authentication, per-key rate limiting, audit logging, and project isolation.
- Orchestrate AI (chat retrieval + RocketRide) and enqueue ingestion jobs.

## Public API (HTTP)
`/v1/projects`, `/v1/projects/:id/{documents,repositories,chats,chat,search,evaluation,stats}`,
`/v1/jobs/:id`, `/health/{live,ready}`. See each `modules/*/interface/*.controller.ts`.

## Dependencies
`@meshify/{config,shared,data-access,vector-store,embeddings,queues,object-storage,rocketride-gateway}`;
`express`, `bullmq`, `ioredis`, `pg`, `multer`, `zod`, `pino(-http)`.

## Consumers
`apps/bff` (proxies browser traffic here). Not called by the browser directly.

## How to extend
Follow port → use case → controller → wire in `main.ts`. See
[Backend Architecture](../../docs/architecture/backend.md) and
[Contributing](../../docs/contributing/index.md).

## How to test
`pnpm --filter @meshify/platform-api test` (Vitest). Use cases are unit-tested
with in-memory ports from [`@meshify/testing`](../../packages/testing/README.md).

## How to debug
- Structured logs via `pino` (correlation ids; credentials redacted).
- `GET /health/ready` reports which dependency is down.
- Typed domain errors (`ChatNotFoundError`, …) map to HTTP status in controllers.

## Key files
`src/main.ts` (composition root), `src/modules/**`.

---
[← Handbook](../../docs/README.md)
