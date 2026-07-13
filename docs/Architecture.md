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
4. **Qdrant is the single retrieval engine, but RocketRide owns the collection *contents*.** RocketRide's `qdrant` component will only write to a collection it recognises as its own — on first write it checks for a "schema" control document (a point with `meta.objectId === "schema"`) and errors otherwise. So `QdrantCollectionProvisioner` still creates both of a project's collections up front (dense-only Cosine, matching RocketRide's shape) but now also writes that schema control document, so RocketRide accepts them at ingest. Chunks are stored by RocketRide with its own payload schema (`content` + `meta.{parent, chunkId, objectId, isDeleted}`), which the direct-search and chat-citation paths read (see "Search" below). The former sparse `text` slot was dropped — it was never populated and diverged from RocketRide's format.
5. **S3-compatible storage abstraction** — MinIO locally, S3/R2/Spaces in production.
6. **GitHub App** (not PATs) for repository ingestion.
7. **Stateless BullMQ workers**, no leader election; BullMQ's failed-job list is the DLQ.
8. **The API never blocks on slow work.** Uploads land in object storage and a queue; ingestion happens in the worker. Chat calls RocketRide synchronously against an already-running pipeline; search queries Qdrant directly (see below).

## RocketRide deployment mode and Qdrant reachability

RocketRide runs in one of two modes, chosen entirely by `ROCKETRIDE_URI`: a **self-hosted server** (no public Docker image exists for this today — `infrastructure/docker/docker-compose.yml` deliberately does not attempt to run one) or **RocketRide's managed cloud** (`ROCKETRIDE_URI=https://api.rocketride.ai`, provisioned via the VS Code extension). This choice has a hard consequence for Qdrant: **whatever `QDRANT_URL` resolves to must be reachable from wherever RocketRide's engine actually runs, not from our own machine/container.** A `localhost` or Docker-network hostname is only valid when RocketRide is self-hosted on the same network; against the cloud engine it resolves on RocketRide's infrastructure and is unreachable — pipelines fail with a store/collection connectivity error, not an auth error.

To support both, every Qdrant target (`QdrantTargetConfig` in `@meshify/rocketride-gateway`) carries an optional `apiKey`. When set, the pipeline builder emits RocketRide's `qdrant` component with `profile: "cloud"` (`host`, `port`, `apikey`, per-node `serverName` to avoid tool-name collisions between the docs/code nodes); when absent, it emits `profile: "local"` (plain `host`/`port`, no auth) — unchanged from before. `platform-api` and `worker` both read `QDRANT_API_KEY` from env and thread it through the chat pipeline resolver and all three ingest/sync processors. In cloud mode this means **Qdrant itself must be network-reachable from the internet** — e.g. Qdrant Cloud — not the local Docker Compose Qdrant.

## Search path (why it bypasses RocketRide)

`POST /v1/projects/:id/search` does **not** go through a RocketRide pipeline — RocketRide's `qdrant` component only accepts `collection/host/port/score`, with no query-embedding or filter input. So search queries Qdrant's REST API directly from `@meshify/vector-store`, and embeds the query through `@meshify/embeddings` using the project's stored `embedding_profile` (the one place we call an embedding provider directly, since RocketRide exposes no query-embedding call; the shared profile guarantees no drift from ingest). Results from the documents and code collections are merged by cosine score (comparable because both use the same model).

Because RocketRide owns the payloads, the result mapping (`search-result.ts`) reads RocketRide's schema — `meta.parent` (source path), `meta.chunkId`, `payload.content` — and skips the schema control document (`meta.isDeleted`). **Metadata filters** (`language`, `parentType`, `sourcePathPrefix`) are accepted by the API but RocketRide's payload doesn't carry `language`/`parent_type`, so those filters currently match nothing — a known gap.

## Chat retrieval path (why it also bypasses RocketRide)

Chat's RocketRide pipeline (`chat-pipeline.ts`) is a **bare LLM call** — `chat -> llm -> response_answers`, nothing else. It did not start that way: the first version routed retrieval through RocketRide's own `qdrant` and `prompt` nodes, mirroring the documented RAG pattern. That component's schema (`.rocketride/schema/qdrant.json`) only exposes a `score` floor (a fixed enum: `0/0.4/0.6/0.7/0.8/0.9/1`) with **no result-count cap** — on a nontrivial code collection this meant ~25 sizeable chunks landing in the prompt node regardless of the score chosen, and empirically the LLM then stopped grounding on them at all: it answered generically even when the exact right file was in the (correctly retrieved) document list, on questions as specific as naming a constant. Retrieval is now done by `ChatContextRetriever` (`VectorSearchContextRetriever` in platform-api) — the exact same embedding + direct-Qdrant-REST path `/search` uses — capped to the top 8 chunks by score, folded into a single prompt string (`buildRagPrompt`) that becomes the "question" RocketRide's LLM node receives. `AskQuestionUseCase` and `RunEvaluationUseCase` both build citations/confidence from this retrieval directly rather than parsing them back out of RocketRide's response.

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
- **Qdrant** — vectors + RocketRide's retrieval payload (`content` + `meta.{parent, chunkId, objectId, isDeleted}`), plus one schema control document per collection.

## Known limitations (accepted, tracked)

- **Search is dense-only, not hybrid.** Collections are dense Cosine only (RocketRide's shape); RocketRide's `qdrant` node writes dense vectors only, so true dense+sparse hybrid (and pure keyword) retrieval isn't available. `/search` fully supports semantic (dense) search; `mode: keyword` and `mode: hybrid` are accepted but **degrade to semantic** with a `degradedTo`/`warning`. Metadata filters (`language`/`parentType`) also match nothing, since RocketRide's payload doesn't store those fields.
- **RocketRide SDK/cloud gaps observed while integrating:** the SDK's `validate()` RPC (v1.3.0) rejects even RocketRide's own documented pipeline example against both cloud and the local engine — it's a broken pre-flight, not used on the execution path (`use()`), so it doesn't block ingest/chat. Separately, RocketRide's **cloud** binary file-upload pipe corrupted uploads server-side (byte-perfect on our wire, garbage received); the **local engine works correctly**. Running workflows on cloud also requires a paid subscription. Local (extension-managed) engine is the working path today; its endpoint is an OS-assigned port the extension manages (`ROCKETRIDE_URI` in `.env`).
- **Stale vector GC:** repository sync marks removed files `deleted` in Postgres and re-ingests changed files, but does not yet delete their old points from Qdrant — that requires chunk/point tracking, which lands with the reindex step. Until then, stale chunks may still be retrieved/cited after a sync.
- **DAP event gaps:** RocketRide has no durable event history; if the observability ingester is offline, events in that window are lost (reconciled from the next `running` snapshot only). The `apps/observability` ingester is therefore a **single instance** — scaling it needs leader election, or every replica double-writes.

## Deployment (Kubernetes)

`infrastructure/kubernetes/` holds a Kustomize base + dev/prod overlays. The scaling model mirrors the runtime roles: **platform-api** is stateless and scales horizontally on CPU (HPA, anti-affinity, PDB); **worker** scales on BullMQ queue depth via KEDA (`bull:<queue>:wait` length across the three queues), with in-flight jobs safely returning to the queue on SIGTERM; **observability** is pinned to a single replica with a `Recreate` strategy — never two instances, since it has no leader election and would double-write `pipeline_runs`. Schema changes run as a pre-rollout migrate Job (the platform-api image now ships the migration SQL). Stateful dependencies (Postgres, Redis, Qdrant, object storage, RocketRide) are external/managed and referenced via ConfigMap/Secret; the manifests don't provision them. See `infrastructure/kubernetes/README.md`.

## Full design document

The complete Phase I architecture (Qdrant payload schema, API contract, security model, observability/DAP-ingester design, deployment plan) lives in the published design artifact; this file is the in-repo summary. Update both when a settled decision changes.
