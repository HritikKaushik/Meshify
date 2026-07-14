---
title: FAQ
purpose: Quick answers to recurring engineering questions, each linking to the authoritative doc.
audience: All engineers and AI assistants.
owner: Platform Team
status: stable
last_updated: 2026-07-14
related:
  - ../README.md
---

# FAQ

> Short answers with a link to the full story.

## Architecture
**Why a BFF instead of calling platform-api directly?**
So the browser never holds a platform API key; the BFF exchanges a Clerk session
for the org key server-side. → [Auth](../backend/auth.md)

**Why is retrieval done outside RocketRide?**
RocketRide's Qdrant component can't apply the metadata filters search needs, so
retrieval queries Qdrant directly via `@meshify/vector-store`. → [RAG](../ai/rag-and-ingestion.md)

**Where do I put shared logic — app or package?**
A package, if more than one app needs it. Apps are thin composition roots.
→ [Overview](../architecture/overview.md)

## Backend
**How do I add an endpoint?**
Port → use case → controller → wire in `main.ts` → test. → [Contributing](../contributing/index.md)

**Can I query Postgres from a use case?**
No — inject a repository port. Raw SQL lives only in `data-access`.
→ [Backend](../architecture/backend.md)

**Why does a valid id sometimes 404?**
Cross-org access is masked as 404 by the isolation guard. → [Auth](../backend/auth.md)

## AI / ingestion
**Why is my upload not searchable yet?**
Ingestion is async; the worker must finish embedding it. Check `pipeline_jobs`.
→ [Queues & Workers](../backend/queues-and-workers.md)

**How is one project's data kept separate from another's?**
Per-project Qdrant collections + `project_id` scoping + the isolation guard.
→ [Data Model](../architecture/data-model.md)

## Testing
**Where do shared fixtures/mocks live?**
`@meshify/testing`. Never redefine them inline. → [Testing](../testing/index.md)

**Do unit tests go in `tests/`?**
No — unit tests colocate with source; `tests/` is repo-wide only. → [`TESTING.md`](../../TESTING.md)

## Operations
**What should deploys gate on?**
`GET /health/ready` (checks dependencies), not `/health/live`.
→ [Deployment](../operations/deployment.md)

**A service won't boot — where do I look?**
The zod env error names the missing/invalid variable. → [Env](environment-variables.md)

## Related
- [Handbook](../README.md) · [Glossary](glossary.md)

---
[← Handbook](../README.md)
