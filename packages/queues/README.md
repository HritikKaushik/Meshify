---
title: packages/queues
purpose: BullMQ queue definitions, job payload types, and shared job options.
audience: Backend engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-14
related:
  - ../../docs/backend/queues-and-workers.md
---

# @meshify/queues

The queue contract shared by the producer (platform-api) and consumer (worker).

## Purpose & responsibilities
- Define queue names + factories: `document-ingest`, `repo-ingest`, `repo-sync`.
- Define job payload types and the shared `DEFAULT_JOB_OPTS` (retries, backoff, cleanup, DLQ).

## Public API
`createDocumentIngestQueue`, `createRepoIngestQueue`, `createRepoSyncQueue`,
`DOCUMENT_INGEST_QUEUE` / `REPO_INGEST_QUEUE` / `REPO_SYNC_QUEUE`, payload types,
`DEFAULT_JOB_OPTS`.

## Dependencies
`bullmq`.

## Consumers
`apps/platform-api` (enqueue), `apps/worker` (consume).

## How to extend
Add a queue name + factory + payload type; both producer and consumer import from
here so the contract stays in one place.

## How to test
Covered indirectly by worker/API tests; job options live in `src/job-options.ts`.

## How to debug
- Defaults: 5 attempts, exponential backoff, `removeOnComplete {age:24h}`, `removeOnFail:false` (DLQ).
- See [Queues & Workers](../../docs/backend/queues-and-workers.md).

## Key files
`src/document-ingest.queue.ts`, `src/repo-queues.ts`, `src/job-options.ts`.

---
[← Handbook](../../docs/README.md)
