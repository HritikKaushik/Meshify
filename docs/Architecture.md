# Architecture

Meshify Phase I is an **AI Backend-as-a-Service**: an API-only platform giving each project an isolated, RAG-queryable knowledge base over its documents and source code. There is no frontend in this phase; Phase II (Next.js) will consume these APIs.

## System overview

```
client ──HTTP──▶ platform-api ──enqueue──▶ Redis/BullMQ ──consume──▶ worker
                     │                                                 │
                     │ fast reads/writes                               │ RocketRide TS SDK (WebSocket/DAP)
                     ▼                                                 ▼
                 PostgreSQL                                     RocketRide server
                     │                                                 │
                     │ pointers only                                   │ pipelines: ingest / RAG chat
                     ▼                                                 ▼
              Object storage (S3/MinIO)                             Qdrant
```

## Core decisions (settled — do not re-litigate casually)

1. **RocketRide is the AI engine, nothing more.** All LLM, embedding, RAG, and agent execution runs as RocketRide pipelines (`.pipe` DAGs). Everything RocketRide does not provide — multi-tenancy, REST APIs, queues, persistence, GitHub/ZIP handling, run history — is our code. Only `@meshify/rocketride-gateway` may import the RocketRide SDK.
2. **Pipeline-per-project, started once.** Each project owns three pipeline GUIDs (docs-ingest, code-ingest, chat). Pipelines start lazily on first use with `useExisting: true` and are reused across requests (RocketRide documents pipeline-per-request as an anti-pattern).
3. **Physical tenant isolation.** Two Qdrant collections per project (`proj_<id>_documents`, `proj_<id>_code`), never a shared collection with filters. Project deletion removes collections *before* the Postgres row.
4. **Qdrant is the single retrieval engine.** Collections are provisioned with a dense vector (the project's embedding model) and a sparse `text` slot. The intent was dense+sparse hybrid search — see the "Search" limitation below for where reality currently stands.
5. **S3-compatible storage abstraction** — MinIO locally, S3/R2/Spaces in production.
6. **GitHub App** (not PATs) for repository ingestion.
7. **Stateless BullMQ workers**, no leader election; BullMQ's failed-job list is the DLQ.
8. **The API never blocks on slow work.** Uploads land in object storage and a queue; ingestion happens in the worker. Chat calls RocketRide synchronously against an already-running pipeline; search queries Qdrant directly (see below).

## Search path (why it bypasses RocketRide)

`POST /v1/projects/:id/search` does **not** go through a RocketRide pipeline. RocketRide's `qdrant` component only accepts `collection/host/port/score` — it has no metadata-filter input and cannot query sparse vectors — but the search feature requires metadata filters (language, parent type, source-path prefix). So search queries Qdrant's REST API directly from `@meshify/vector-store`, and embeds the query through `@meshify/embeddings` using the project's stored `embedding_profile` (the one place we call an embedding provider directly, since RocketRide exposes no query-embedding call; the shared profile guarantees no drift from ingest). Results from the documents and code collections are merged by cosine score (comparable because both use the same model).

## Security (auth, rate limiting, audit)

Every route except health/readiness sits behind three middlewares, in order: **authenticate → rate-limit → audit**.

- **API-key auth.** Callers present `Authorization: Bearer msk_<secret>`. Keys are stored only as `HMAC-SHA256(PLATFORM_API_KEY_PEPPER, plaintext)` — the pepper is a server-held secret, so a database leak alone can't verify or forge a key. Auth is a single indexed lookup by hash resolving to `req.auth = { orgId, keyId, scopes }`. Missing / malformed / unknown / revoked / expired all return an identical `401` so callers can't probe which keys exist. Keys are issued out-of-band by an operator (`pnpm --filter @meshify/data-access issue-api-key`), never via a public endpoint.
- **Cross-org isolation is enforced at the guard, not just the query.** `projectIsolationGuard` now requires `project.orgId === req.auth.orgId` and returns **404** (not 403) on mismatch, so project ids can't be probed across tenants. `create-project` takes `orgId` from the key, never the body. Read paths keyed by opaque id (e.g. `GET /v1/jobs/:jobId`) use org-scoped lookups (`findByIdForOrg`) for the same reason.
- **Rate limiting.** Per-key fixed-window counter in Redis (`RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SEC`), keyed on `keyId` (not a spoofable IP). Emits `RateLimit-*` headers; `429` + `Retry-After` on exhaustion. **Fails open** — a Redis blip degrades throttling, not availability.
- **Audit logging.** Every mutating (non-GET) authenticated request is written to `audit_logs` on response `finish` (off the critical path, errors swallowed): org, actor key, project, action, client IP, status. `audit_logs.actor_key_id` (added in 0006) records the key; `actor_id`/users is reserved for Phase II human actors.

## Evaluation harness (regression testing)

`POST /v1/projects/:id/evaluation/run` runs a caller-supplied **golden set** of Q&A cases through the project's real RAG chat pipeline — the same `RagPort` + `ChatPipelineResolver` seams live chat uses, so a run exercises the exact path production queries take. Each case declares composable expectations (required / any / forbidden keywords, expected citation sources, min-confidence); a pure `evaluateAnswer` scores the answer, and the endpoint returns a report (pass rate, per-case check breakdown, average confidence/latency, total tokens). Cases run **sequentially** against the one resolved pipeline token (no assumption RocketRide serves concurrent turns on a token) and the set is **capped** (`MAX_CASES`) to keep the synchronous request bounded; a per-case RAG failure is captured on that case and never aborts the run. State is intentionally not persisted — CI asserts on the returned JSON (e.g. `passRate >= 0.9`); the run is captured by the audit middleware.

## Layering (inside platform-api modules)

`domain/` (no deps) ← `application/` (use-cases) ← `infrastructure/` (Postgres, queues, gateways) and `interface/` (Express controllers, DTOs, guards). Dependencies point inward only; `RagPort` in rocketride-gateway is the seam that keeps AI orchestration out of business logic (tests use `FakeRagService`).

## Data placement

- **PostgreSQL** — all relational metadata (orgs, users, projects, repositories, files, documents, chunks, chats, messages, pipeline_jobs, audit) plus the observability sink. Never document content or vectors.
- **Object storage** — raw uploaded bytes, keyed `projects/<projectId>/documents/<docId>/<filename>`.
- **Qdrant** — vectors + retrieval payload (source path, chunk index, hashes).

## Known limitations (accepted, tracked)

- **Search is dense-only, not hybrid yet.** Collections carry a sparse `text` slot, but RocketRide's `qdrant` ingest node writes dense vectors only and never populates it, so true dense+sparse hybrid (and pure keyword) retrieval isn't available. `/search` fully supports semantic (dense) search + metadata filters; `mode: keyword` and `mode: hybrid` are accepted but **degrade to semantic** and return a `degradedTo`/`warning` in the response. Real hybrid requires writing sparse vectors at ingest, which RocketRide's node can't do — it needs a custom ingest step (future).
- **Stale vector GC:** repository sync marks removed files `deleted` in Postgres and re-ingests changed files, but does not yet delete their old points from Qdrant — that requires chunk/point tracking, which lands with the reindex step. Until then, stale chunks may still be retrieved/cited after a sync.
- **DAP event gaps:** RocketRide has no durable event history; if the observability ingester is offline, events in that window are lost (reconciled from the next `running` snapshot only). The `apps/observability` ingester is therefore a **single instance** — scaling it needs leader election, or every replica double-writes.

## Full design document

The complete Phase I architecture (Qdrant payload schema, API contract, security model, observability/DAP-ingester design, deployment plan) lives in the published design artifact; this file is the in-repo summary. Update both when a settled decision changes.
