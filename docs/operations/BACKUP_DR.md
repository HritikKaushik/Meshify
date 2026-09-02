# Meshify — Backup & Disaster Recovery

What to back up, how, and how to restore. Meshify's state spans four stores with
very different recovery characteristics — the key insight is that **only Postgres
and object storage are authoritative**; Qdrant and Redis are derived/ephemeral and
can be rebuilt.

| Store | Holds | Authoritative? | Backup | RPO | Recovery |
|---|---|---|---|---|---|
| **Postgres** (Render Postgres; or Neon) | Orgs, projects, documents, jobs, integrations, encrypted credentials, chat history, audit log | **Yes - the source of truth** | Render daily backups (+ PITR where the plan offers it); Neon PITR + branches | ≤ minutes–24 h (plan-dependent) | Restore to a backup/timestamp |
| **Object storage** (Backblaze B2) | Raw uploaded files (the re-ingestion source) | **Yes** | B2 durability (11 nines) + optional versioning | ~0 | Re-reference; restore a version if overwritten |
| **Qdrant** | Per-project vector collections | No — **derived** from docs+repos | Qdrant Cloud snapshots | hours (snapshot cadence) | Restore snapshot, OR re-ingest from Postgres+B2 |
| **Redis** (Render Key Value; or Upstash) | BullMQ jobs, rate-limit counters, pub/sub | No - **ephemeral** | Render Key Value persistence (paid plans only; `free` is in-memory) / Upstash AOF | best-effort | In-flight jobs re-enqueue; counters/streams self-heal |

## Targets
- **RPO** (max data loss): **≤ 5 min** for authoritative stores (Postgres, B2).
- **RTO** (time to restore): **≤ 1 h** for a full rebuild (Postgres restore is minutes; Qdrant re-ingestion dominates and can run in the background while the app serves).

---

## Postgres - the one that matters
- **Render Postgres** (the `render.yaml` default): paid instances get automatic **daily backups**; check the instance's *Recovery* tab for retention and enable **point-in-time recovery** if your plan offers it. Restoring creates a new instance - point every service's `DATABASE_URL` at it (the Blueprint references the database by name, so the simplest path is to restore *into* the existing instance where Render offers that).
- **Neon** (if you kept the data tier external): enable PITR and restore by creating a **branch at a timestamp** (instant, non-destructive - verify before cutting over); update `DATABASE_URL` on all backend services, then redeploy.
- **Before risky migrations**, take a manual backup / create a branch as a rollback point (migrations are expand/contract, but a backup is a cheap safety net).
- ⚠️ **Encryption keys are NOT in Postgres.** `ORG_KEY_ENCRYPTION_KEY` / `INTEGRATION_ENCRYPTION_KEY` / `PLATFORM_API_KEY_PEPPER` live only in your secret store. **A Postgres restore is useless without the same keys** — back them up in your password manager / secrets vault. Losing `ORG_KEY_ENCRYPTION_KEY` makes every stored credential undecryptable.

## Object storage (Backblaze B2)
- B2 is durable by design (no scheduled backup needed). **Enable Object Lock / file versioning** (or a keep-prior-versions lifecycle rule) if you want to recover from an accidental overwrite/delete of a raw upload.
- Raw uploads are the **source for re-ingestion** — as long as they survive, Qdrant can be fully rebuilt.

## Qdrant — derived, snapshot for speed
- Schedule **Qdrant Cloud snapshots** (e.g. daily). Restoring a snapshot is far faster than re-ingesting a large corpus.
- If a snapshot is stale or missing, vectors can be **rebuilt by re-ingestion**: the documents (Postgres rows) + raw files (B2) + repositories are re-embedded. This is the ultimate fallback and needs no Qdrant backup at all — only more time.

## Redis - ephemeral
- On Render, the `free` Key Value plan is **in-memory only**; upgrade `meshify-redis` to `256mb` (persistence on by default) so a restart doesn't drop queued jobs. On Upstash, enable AOF persistence.
- Losing Redis is survivable: in-flight ingest jobs are retried (they carry only IDs and re-resolve state from Postgres), rate-limit counters reset, and SSE pub/sub reconnects. No backup required — just don't treat it as a store of record.

---

## Full-restore runbook (worst case)
1. **Secrets first.** Confirm you still hold `ORG_KEY_ENCRYPTION_KEY`, `INTEGRATION_ENCRYPTION_KEY`, `PLATFORM_API_KEY_PEPPER` (identical values to the lost deployment). Without them the DB restore can't decrypt credentials.
2. **Postgres** - restore the Render backup (or branch Neon) to the target timestamp; point `DATABASE_URL` at it.
3. **Object storage** — B2 bucket intact (or restore versions). No action if durable.
4. **Redis** - a fresh Render Key Value / Upstash instance; set `REDIS_URL`. Empty is fine.
5. **Qdrant** — restore the latest snapshot into a fresh cluster; set `QDRANT_URL`/`QDRANT_API_KEY`. If no usable snapshot, skip — step 7 rebuilds it.
6. **Deploy** the backend services (Render / Railway / K8s) with the restored env; on Render every service's pre-deploy step runs the migrator, on K8s run the migrate Job.
7. **Rebuild derived state if needed** — re-run ingestion for projects whose Qdrant collections are missing/stale (from Postgres doc rows + B2 files + connected repos).
8. **Verify** per [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) step G (health + a real ingest→chat round-trip).

## Test your backups
A backup you've never restored is a hypothesis. Quarterly: branch Postgres to a past timestamp and boot a throwaway stack against it; confirm sign-in + an existing project's chat works. Confirm the encryption keys in your vault actually decrypt a known credential.
