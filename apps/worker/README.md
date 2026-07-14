---
title: apps/worker
purpose: BullMQ consumer that ingests documents and repositories into per-project vector stores.
audience: Backend engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-14
related:
  - ../../docs/backend/queues-and-workers.md
  - ../../docs/ai/rag-and-ingestion.md
---

# @meshify/worker

The asynchronous ingestion engine. Consumes BullMQ jobs enqueued by platform-api.

## Purpose & responsibilities
- Process `document-ingest`, `repo-ingest`, and `repo-sync` jobs.
- Download sources (S3 / GitHub App tarball), extract/scan repos, and stream files through RocketRide ingest pipelines into Qdrant.
- Maintain durable job state in `pipeline_jobs` and document/repo/file status.

## Public API (queues)
Consumes the three queues from `@meshify/queues`. No HTTP surface.

## Dependencies
`@meshify/{config,shared,data-access,github,object-storage,queues,rocketride-gateway}`,
`bullmq`, `ioredis`, `pg`, `adm-zip`, `tar`.

## Consumers
None (terminal consumer). Producers: `apps/platform-api`.

## How to extend
Add a processor under `src/processors/` and register the worker (with tuned
concurrency) in `src/main.ts`. Keep processors **idempotent** (retries are safe).

## How to test
`pnpm --filter @meshify/worker test` (e.g. `src/repo/repo-scanner.test.ts`).

## How to debug
- Inspect `pipeline_jobs.last_error` for failed/dead-lettered jobs.
- Concurrency + retry/backoff are in `src/main.ts` and `@meshify/queues` job options.
- Archive handling is zip-slip-safe (`src/repo/archive-extractor.ts`).

## Key files
`src/main.ts`, `src/processors/**`, `src/repo/**`.

---
[← Handbook](../../docs/README.md)
