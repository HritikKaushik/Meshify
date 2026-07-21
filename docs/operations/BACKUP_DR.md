# Meshify — Backup & Disaster Recovery

What to back up, how, and how to restore. Meshify's state spans four stores with
very different recovery characteristics — the key insight is that **only Postgres
and object storage are authoritative**; Qdrant and Redis are derived/ephemeral and
can be rebuilt.

| Store | Holds | Authoritative? | Backup | RPO | Recovery |
|---|---|---|---|---|---|
| **Postgres** (Neon) | Orgs, projects, documents, jobs, integrations, encrypted credentials, chat history, audit log | **Yes — the source of truth** | Neon PITR + branches | ≤ minutes | Restore/branch to a timestamp |
| **Object storage** (Backblaze B2) | Raw uploaded files (the re-ingestion source) | **Yes** | B2 durability (11 nines) + optional versioning | ~0 | Re-reference; restore a version if overwritten |
| **Qdrant** | Per-project vector collections | No — **derived** from docs+repos | Qdrant Cloud snapshots | hours (snapshot cadence) | Restore snapshot, OR re-ingest from Postgres+B2 |
| **Redis** (Upstash) | BullMQ jobs, rate-limit counters, pub/sub | No — **ephemeral** | Upstash persistence (AOF) | best-effort | In-flight jobs re-enqueue; counters/streams self-heal |

## Targets
- **RPO** (max data loss): **≤ 5 min** for authoritative stores (Postgres, B2).
- **RTO** (time to restore): **≤ 1 h** for a full rebuild (Postgres restore is minutes; Qdrant re-ingestion dominates and can run in the background while the app serves).

---

## Postgres (Neon) — the one that matters
- **Enable PITR.** Neon retains WAL history (7 days on Free, longer on paid) — every point in that window is restorable. No action needed beyond choosing a retention that meets your RPO.
- **Restore** by creating a **branch at a timestamp** (instant, non-destructive — verify before cutting over) or an in-place restore. Update `DATABASE_URL` on all backend services to the restored branch, then redeploy.
- **Before risky migrations**, create a branch as a rollback point (the migrate Job is expand/contract, but a branch is a cheap safety net).
- ⚠️ **Encryption keys are NOT in Postgres.** `ORG_KEY_ENCRYPTION_KEY` / `INTEGRATION_ENCRYPTION_KEY` / `PLATFORM_API_KEY_PEPPER` live only in your secret store. **A Postgres restore is useless without the same keys** — back them up in your password manager / secrets vault. Losing `ORG_KEY_ENCRYPTION_KEY` makes every stored credential undecryptable.

## Object storage (Backblaze B2)
- B2 is durable by design (no scheduled backup needed). **Enable Object Lock / file versioning** (or a keep-prior-versions lifecycle rule) if you want to recover from an accidental overwrite/delete of a raw upload.
- Raw uploads are the **source for re-ingestion** — as long as they survive, Qdrant can be fully rebuilt.

## Qdrant — derived, snapshot for speed
- Schedule **Qdrant Cloud snapshots** (e.g. daily). Restoring a snapshot is far faster than re-ingesting a large corpus.
- If a snapshot is stale or missing, vectors can be **rebuilt by re-ingestion**: the documents (Postgres rows) + raw files (B2) + repositories are re-embedded. This is the ultimate fallback and needs no Qdrant backup at all — only more time.

## Redis (Upstash) — ephemeral
- Enable Upstash persistence (AOF) so a restart doesn't drop queued jobs.
- Losing Redis is survivable: in-flight ingest jobs are retried (they carry only IDs and re-resolve state from Postgres), rate-limit counters reset, and SSE pub/sub reconnects. No backup required — just don't treat it as a store of record.

---

## Full-restore runbook (worst case)
1. **Secrets first.** Confirm you still hold `ORG_KEY_ENCRYPTION_KEY`, `INTEGRATION_ENCRYPTION_KEY`, `PLATFORM_API_KEY_PEPPER` (identical values to the lost deployment). Without them the DB restore can't decrypt credentials.
2. **Postgres** — restore/branch Neon to the target timestamp; point `DATABASE_URL` at it.
3. **Object storage** — B2 bucket intact (or restore versions). No action if durable.
4. **Redis** — provision a fresh Upstash DB; set `REDIS_URL`. Empty is fine.
5. **Qdrant** — restore the latest snapshot into a fresh cluster; set `QDRANT_URL`/`QDRANT_API_KEY`. If no usable snapshot, skip — step 7 rebuilds it.
6. **Deploy** the backend services (Render Blueprint / K8s) with the restored env; run the migrate Job.
7. **Rebuild derived state if needed** — re-run ingestion for projects whose Qdrant collections are missing/stale (from Postgres doc rows + B2 files + connected repos).
8. **Verify** per [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) step 10 (health + a real ingest→chat round-trip).

## Test your backups
A backup you've never restored is a hypothesis. Quarterly: branch Postgres to a past timestamp and boot a throwaway stack against it; confirm sign-in + an existing project's chat works. Confirm the encryption keys in your vault actually decrypt a known credential.
