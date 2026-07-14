---
title: packages/rocketride-gateway
purpose: The single boundary to RocketRide AI — pipeline reuse, RAG service, and client pooling.
audience: Backend / AI engineers.
owner: AI Team
status: stable
last_updated: 2026-07-14
related:
  - ../../docs/ai/rag-and-ingestion.md
---

# @meshify/rocketride-gateway

The **only** package allowed to import the `rocketride` SDK. Everything else
depends on this abstraction.

## Purpose & responsibilities
- Expose `RagService` (chat generation + `ingestFiles`) and `PipelineRegistry` (reuse pipelines via `useExisting`).
- Pool RocketRide clients; build/validate pipelines; surface a `RagPort` for use cases.

## Public API
`RocketRideClientPool`, `PipelineRegistry`, `RocketRideRagService`, `RagPort`,
pipeline builders, and `check`/`export-pipelines` CLI helpers.

## Dependencies
`@meshify/config`, `rocketride`.

## Consumers
`apps/platform-api` (chat), `apps/worker` (ingestion), `apps/observability` (traces).

## How to extend
Add capability behind this package's interfaces so platform-api/worker stay
SDK-free. Reuse pipelines through `PipelineRegistry`; never create one per
request/job.

## How to test
`pnpm --filter @meshify/rocketride-gateway test` (e.g. `src/pipeline-builder/pipeline-builder.test.ts`).

## How to debug
- `src/check.ts` validates connectivity + sample pipelines.
- Chat self-heals a stale pipeline token once before failing (see the resolver in platform-api).

## Key files
`src/**` (pool, registry, rag service, pipeline builders), `.rocketride/docs/` (pipeline rules).

---
[← Handbook](../../docs/README.md)
