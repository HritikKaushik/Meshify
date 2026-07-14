---
title: Glossary
purpose: Canonical terminology used across the Meshify codebase and documentation.
audience: All engineers and AI assistants.
owner: Platform Team
status: stable
last_updated: 2026-07-14
related:
  - ../README.md
---

# Glossary

> Use these terms consistently in code, comments, and docs so search (and RAG)
> stays precise.

## Core
- **Project** — a tenant workspace; owns its documents, repositories, chats, and two Qdrant collections. Table: `projects`.
- **Organization (org)** — the billing/security tenant that owns projects and API keys. Table: `organizations`.
- **Mesh / Mesh AI** — the product-facing name for the assistant that answers over a project's knowledge.

## AI / retrieval
- **RAG** — retrieval-augmented generation: retrieve context from Qdrant, then generate an answer. See [RAG & Ingestion](../ai/rag-and-ingestion.md).
- **Ingestion** — the async pipeline that turns a document or repo into embedded vectors.
- **RocketRide** — the external AI infrastructure Meshify runs pipelines on; accessed only via `@meshify/rocketride-gateway`.
- **Pipeline** — a RocketRide graph (ingest or chat) reused per project via `PipelineRegistry`.
- **Collection** — a Qdrant vector namespace; each project has `proj_<id>_documents` and `proj_<id>_code`.
- **Chunk** — an embedded slice of a document/file stored in Qdrant with metadata (`source_path`, `parent_type`).
- **Citation / Confidence** — the sources and score attached to a chat answer.

## Platform
- **BFF** — backend-for-frontend (`apps/bff`): turns a Clerk session into an org API key and proxies to platform-api.
- **platform-api** — the core API (`apps/platform-api`).
- **Worker** — `apps/worker`, the BullMQ consumer for ingestion.
- **Use case** — an application-layer class holding one unit of business logic.
- **Repository (port)** — a data-access interface; implemented by a `postgres-*.repository.ts`. (Distinct from a *Git repository*, which is a `repositories` row.)
- **Project isolation** — enforcing that a request only touches its own org/project; cross-org access returns `404`.
- **DLQ** — dead-letter queue: jobs that exhausted retries, retained in Redis and mirrored in `pipeline_jobs`.
- **Composition root** — `main.ts`, where concrete implementations are wired into use cases.

## Testing
- **Factory** — a deterministic entity builder from `@meshify/testing/factories`.
- **In-memory repository** — a full mock of a data-access port from `@meshify/testing/mocks`.

## References
- Used throughout `docs/**`, `apps/**`, `packages/**`.

## Related
- [Handbook](../README.md)

---
[← Handbook](../README.md)
