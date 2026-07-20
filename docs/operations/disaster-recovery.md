---
title: Disaster Recovery & Failure Playbooks
purpose: How the Provider Platform behaves under each failure, and the recovery procedure.
audience: On-call, operators.
owner: Platform Team
status: stable
last_updated: 2026-07-20
related:
  - provider-platform-operations.md
  - ../backend/queues-and-workers.md
---

# Disaster Recovery & Failure Playbooks

> Design principle: **durable work in Postgres + BullMQ, best-effort in
> Pub/Sub.** Losing Redis Pub/Sub loses live UI updates, never queued work.

## Failure matrix

| Failure | Behavior | Recovery |
| --- | --- | --- |
| **OAuth cancelled/denied** | provider redirects with `?error=`; callback page shows a message; no rows created | user retries |
| **OAuth state expired/replayed** | `InvalidOAuthStateError` → 400 | user restarts connect (fresh 15-min state) |
| **Webhook signature fails** | `401`, nothing recorded | check the app's webhook secret vs the registration |
| **Webhook redelivery** | unique `(provider, delivery_id)` → idempotent no-op | none needed |
| **Worker crash mid-dispatch** | job un-acked → BullMQ redelivers; dispatch is idempotent (dedupe keys, idempotent status flips) | automatic |
| **Sync partial failure** | `flush()` barrier means the cursor never advanced past unembedded content; job retried from last cursor | automatic (5 attempts → `dead_letter`) |
| **Redis outage** | rate limiter **fails open**; SSE drops (auto-reconnect); no new jobs enqueue/consume | restore Redis; queued jobs resume; `pipeline_jobs` rows are the source of truth |
| **Worker restart** | `SIGTERM` drains in-flight jobs (`worker.close()`); Job Scheduler re-upserts idempotently | automatic |
| **platform-api restart** | `SIGTERM` closes queues/pools; SSE clients auto-reconnect | automatic |
| **Postgres restart** | connection pool reconnects; in-flight queries error and their jobs retry | automatic; verify no jobs stuck `running` (see below) |
| **Provider outage** | provider API calls fail; sync/health jobs retry with backoff, then `dead_letter`; integration health flips on auth-shaped failures | automatic; inspect `pipeline_jobs.last_error` |
| **Expired credentials** | maintenance `refresh` sweep rotates <30-min-to-expiry; a dead refresh token → health `needs_reauthorization` + `health.changed` event | user reconnects |
| **Revoked credentials** | provider webhook (`tokens_revoked`/`app_uninstalled`) → `connection.revoked` → integration+connectors disconnected | user reconnects |
| **Permission change** | `installation_repositories`/`member` events → inventory upkeep, affected connectors flagged | automatic |

## Known recovery edge cases

- **Job stuck in `running` after a hard worker kill (SIGKILL, OOM):** BullMQ's
  stalled-job detection re-queues it; the `pipeline_jobs` row stays `running`
  until the retry transitions it. To force-clear, requeue via the DLQ. A repo
  left in `cloning` status re-syncs on the next successful run (idempotent).
- **Slack refresh-token single-use:** if a refresh succeeds at Slack but the
  vault write fails, the old refresh token is spent. The integration flips to
  `needs_reauthorization` on the next call; the user reconnects. *(Hardening
  note: the refresh sweep writes the new pair before considering the rotation
  complete — see the maintenance processor.)*

## Backups & restore

- **Postgres** is the system of record (integrations, registrations, credentials
  [encrypted], connectors, cursors, job history). Standard PITR backups.
- **`INTEGRATION_ENCRYPTION_KEY` is a restore dependency** — a Postgres restore
  without the matching encryption key leaves all stored secrets undecryptable.
  Back the key up in your secrets manager alongside the DB.
- **Qdrant** vectors are derivable — a full re-sync rebuilds them from the
  providers, so Qdrant loss is recoverable (slowly) without data loss.
- **Redis** holds only transient queue state + rate-limit counters; loss means
  in-flight jobs are re-driven from `pipeline_jobs`.

## Region/total-outage recovery order

1. Postgres (with the encryption key available).
2. Redis (empty is fine — jobs re-drive from `pipeline_jobs`).
3. Qdrant (empty is fine — trigger re-syncs).
4. platform-api + worker.
5. Re-point provider webhooks if the ingress host changed.

---
[← Handbook](../README.md)
