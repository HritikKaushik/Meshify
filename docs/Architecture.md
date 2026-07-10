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
4. **Hybrid search on Qdrant** (dense + sparse vectors), single retrieval engine.
5. **S3-compatible storage abstraction** — MinIO locally, S3/R2/Spaces in production.
6. **GitHub App** (not PATs) for repository ingestion.
7. **Stateless BullMQ workers**, no leader election; BullMQ's failed-job list is the DLQ.
8. **The API never blocks on slow work.** Uploads land in object storage and a queue; ingestion happens in the worker. Only chat/search call RocketRide synchronously, against already-running pipelines.

## Layering (inside platform-api modules)

`domain/` (no deps) ← `application/` (use-cases) ← `infrastructure/` (Postgres, queues, gateways) and `interface/` (Express controllers, DTOs, guards). Dependencies point inward only; `RagPort` in rocketride-gateway is the seam that keeps AI orchestration out of business logic (tests use `FakeRagService`).

## Data placement

- **PostgreSQL** — all relational metadata (orgs, users, projects, repositories, files, documents, chunks, chats, messages, pipeline_jobs, audit) plus the observability sink. Never document content or vectors.
- **Object storage** — raw uploaded bytes, keyed `projects/<projectId>/documents/<docId>/<filename>`.
- **Qdrant** — vectors + retrieval payload (source path, chunk index, hashes).

## Full design document

The complete Phase I architecture (Qdrant payload schema, API contract, security model, observability/DAP-ingester design, deployment plan) lives in the published design artifact; this file is the in-repo summary. Update both when a settled decision changes.
