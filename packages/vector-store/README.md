---
title: packages/vector-store
purpose: Qdrant access — collection provisioning and metadata-filtered search/delete.
audience: Backend / AI engineers.
owner: AI Team
status: stable
last_updated: 2026-07-14
related:
  - ../../docs/ai/rag-and-ingestion.md
  - ../../docs/architecture/data-model.md
---

# @meshify/vector-store

Direct Qdrant client. Retrieval bypasses RocketRide because it needs metadata
filters RocketRide's component can't express.

## Purpose & responsibilities
- Provision per-project collections (`QdrantCollectionProvisioner`).
- Search with score threshold + metadata filters, and delete points by filter / source path (`QdrantSearchClient`).

## Public API
`QdrantCollectionProvisioner`, `QdrantSearchClient`, `buildQdrantFilter`, `SearchFilters`, `QdrantSearchHit`.

## Dependencies
None (uses `fetch` against the Qdrant REST API).

## Consumers
`apps/platform-api` (search, delete), `apps/worker` (delete on teardown).

## How to extend
Add filter/query capability to `QdrantSearchClient`. Keep it a thin, typed HTTP client.

## How to test
`pnpm --filter @meshify/vector-store test` (`src/qdrant-*.test.ts`).

## How to debug
- A missing collection returns empty (search) / no-op (delete) rather than erroring.
- Collection names come from the project (`qdrantCollectionName`).

## Key files
`src/qdrant-collection.provisioner.ts`, `src/qdrant-search.client.ts`.

---
[← Handbook](../../docs/README.md)
