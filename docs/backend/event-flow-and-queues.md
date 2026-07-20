---
title: Event Flow & Queue Architecture
purpose: The internal event vocabulary, the event bus, and every queue the Provider Platform uses.
audience: Backend engineers, on-call.
owner: Platform Team
status: stable
last_updated: 2026-07-20
related:
  - provider-platform.md
  - webhook-guide.md
  - queues-and-workers.md
  - realtime-jobs.md
---

# Event Flow & Queue Architecture

## Two event systems, deliberately separate

| System | Transport | Purpose | Consumers |
| --- | --- | --- | --- |
| **Job progress** | Redis Pub/Sub `meshify:jobs` → per-project SSE | live ingestion/sync progress | Job Progress Center |
| **Platform events** | Redis Pub/Sub `meshify:platform-events` → per-org SSE | integration lifecycle (connect/revoke/health/resource) | Integrations marketplace |

They are kept apart because their tenancy keys differ (project vs org) and their
consumers differ. Overloading one on the other would couple the proven jobs
pipeline to the newer integration surface.

## Platform event domains

Provider webhooks are normalized into a **provider-independent** vocabulary
(`packages/providers/src/events/platform-events.ts`), grouped into six domains:

- `connection.*` — established / revoked / suspended / disconnected
- `resource.*` — updated / removed / renamed / discovered
- `content.*` — changed (knowledge-bearing activity inside a resource)
- `permission.*` — changed (grant/scope set changed)
- `health.*` — changed
- `sync.*` — requested / completed / failed

`eventDomain(kind)` gives consumers domain-level subscription granularity. Every
event carries `{ provider, integrationId, orgId }` — `orgId` is the SSE routing
key. The bus is a **port** (`PlatformEventBus`); the shipped transport is Redis
Pub/Sub (`RedisPlatformEventBus`) with a dedicated subscriber connection.

## Durable dispatch vs live fan-out

The **sync-triggering** consumer (webhook → sync) runs inside a **BullMQ job**
(durable, retried) — a crash never loses a sync trigger. The bus Pub/Sub is used
only for **live** fan-out to SSE (best-effort by nature). This split is why a
Redis outage degrades live updates but never loses work.

## Queues

| Queue | Producer | Worker concurrency | Payload |
| --- | --- | --- | --- |
| `document-ingest` | document upload | 5 | `{ pipelineJobId, documentId, projectId }` |
| `source-sync` | connect/select/sync + webhook + reconcile | 3 | `{ pipelineJobId, connectorId, projectId, mode }` |
| `webhook-events` | webhook receiver | 5 | `{ webhookEventId }` |
| `integration-maintenance` | Job Scheduler (worker) | 1 | `{ task: refresh\|health\|retention }` |
| `repo-ingest`, `repo-sync`, `slack-ingest`, `slack-sync` | *(legacy — drain only)* | 2–3 | pre-cutover jobs |

The legacy per-provider queues exist only to drain jobs enqueued before the
generic `source-sync` cutover; no new work is produced onto them. They can be
removed once no in-flight jobs remain.

## Job durability & dedupe

- Every enqueue pins BullMQ `jobId` to a `pipeline_jobs` row (the durable DLQ
  mirror; statuses `queued/running/completed/failed/dead_letter`).
- Webhook/reconcile syncs use a **deterministic `dedupe_key`**
  (`source_sync:<connectorId>:<mode>`) with a queued-only partial unique index —
  bursts collapse to one queued job; a running job still admits one follow-up.
- Retries: 5 attempts, exponential backoff (5 s base), `removeOnFail: false`
  (failed jobs retained as the DLQ).

---
[← Handbook](../README.md)
