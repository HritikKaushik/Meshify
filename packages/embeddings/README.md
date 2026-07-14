---
title: packages/embeddings
purpose: Provider-agnostic text embedding for search and retrieval.
audience: Backend / AI engineers.
owner: AI Team
status: stable
last_updated: 2026-07-14
related:
  - ../../docs/ai/rag-and-ingestion.md
---

# @meshify/embeddings

Selects an embedding provider from a project's embedding profile and produces
query vectors. A thin, stateless `fetch` wrapper (no heavy SDK).

## Purpose & responsibilities
- `createEmbeddingProvider(profile, keys)` → an `EmbeddingProvider` that embeds text.
- Map embedding profiles to providers (`isOpenAiEmbeddingProfile`).

## Public API
`createEmbeddingProvider`, `EmbeddingProvider`, `OpenAiEmbeddingProvider`,
`UnsupportedEmbeddingProfileError`, `MissingEmbeddingKeyError`.

## Dependencies
None.

## Consumers
`apps/platform-api` (search + chat retrieval).

## How to extend
Add a provider implementing `EmbeddingProvider` and wire it in `factory.ts`.

## How to test
`pnpm --filter @meshify/embeddings test` (`src/factory.test.ts`).

## How to debug
- Profile → provider mapping errors throw typed errors named above.
- Providers are created per request (cheap, stateless).

## Key files
`src/factory.ts`, `src/embedding-provider.ts`, `src/openai-embedding-provider.ts`.

---
[← Handbook](../../docs/README.md)
