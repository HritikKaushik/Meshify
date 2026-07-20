---
title: Connector Engine & Knowledge Pipeline
purpose: How provider content is normalized, de-duplicated, and written into the knowledge graph.
audience: Backend engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-20
related:
  - provider-platform.md
  - ../ai/rag-and-ingestion.md
---

# Connector Engine & Knowledge Pipeline

> The Connector Engine sits between providers and the knowledge layer. Providers
> decide *what* to fetch and how it maps to `KnowledgeItem`s; the engine owns
> *how* it lands — batching, change detection, purge-before-reingest, and the
> summary. The AI layer consumes only what passes through it.

## Pipeline

```
Provider.executeSync(ctx, sink)
        │  pushes KnowledgeItems
        ▼
ConnectorEngine (packages/providers/src/engine)
   ├─ ContentLedger.getHashes   → skip unchanged (content-hash)
   ├─ purge-before-reingest     → delete stale vectors before re-embed (no dupes)
   ├─ batch (25)                → KnowledgeWriter.embed
   └─ ContentLedger.setHashes   → mark embedded
        ▼
KnowledgeWriter (apps/worker)  → RocketRide ingest pipeline → Qdrant
```

## Contracts

- **`KnowledgeItem`** — `{ sourceRef, target: 'documents'|'code', content, contentHash, metadata? }`.
  `sourceRef` is the canonical address (`<provider>/<account>/<workspace>/<resource>/<item>`;
  legacy GitHub paths and `slack/…` refs are grandfathered).
- **`KnowledgeSink`** — `upsert`, `remove`, `flush`, `progress`, `scopeFailed`.
  The **`flush()` barrier** is load-bearing: a cursor must never advance past
  content that hasn't been durably embedded, so providers call `sink.flush()`
  *before* committing a sync cursor.
- **`KnowledgeWriter`** (worker port) — `embed(target, items)` /
  `deleteBySourceRefs(target, refs)` over RocketRide + Qdrant, project-scoped.
- **`ContentLedger`** (worker port) — the engine's change-detection memory,
  backed by each source's detail table (`files.content_hash`,
  `slack_conversations.content_hash`) so ledger state and detail rows can never
  disagree. A hash counts only once **embedded**, so pending rows re-embed on
  retry.

## Idempotency & recovery

- **Re-run safety** — an identical sync re-run is a no-op (all hashes match).
- **Purge-before-reingest** — changed/removed refs delete their vectors before
  re-embed; this closed a documented stale-points bug and makes
  high-frequency webhook syncs safe.
- **Partial failure** — the flush barrier guarantees a failed tail-flush retries
  from the previous cursor rather than skipping content.
- **Dedupe keys** — webhook/manual/scheduled syncs enqueue with
  `source_sync:<connectorId>:<mode>`; bursts collapse to one queued job while a
  running job still admits exactly one follow-up.

## The generic sync processor

`apps/worker/src/processors/source-sync.processor.ts` is **one processor for
every provider**: it resolves the provider from the registry, builds the
`SyncContext` (integration vault, resolved registration, cursor store), and runs
the engine. Provider-specific logic lives only in `packages/providers/src/<id>/sync.ts`.

---
[← Handbook](../README.md)
