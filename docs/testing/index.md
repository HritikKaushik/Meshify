---
title: Testing
purpose: Explain the testing architecture and how to write, run, and organize tests.
audience: All engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-14
prerequisites:
  - ../development/getting-started.md
related:
  - ../../TESTING.md
  - ../../packages/testing/README.md
---

# Testing

> Meshify standardizes on **Vitest** with a shared testing package and a
> repository-wide suite. The authoritative, always-current spec is
> [`TESTING.md`](../../TESTING.md) at the repo root; this page is the handbook
> entry point and the mental model.

## Overview

Four layers, no duplicated infrastructure:

```mermaid
flowchart TB
  subgraph shared[@meshify/testing]
    fac[factories] ; mock[in-memory mocks] ; match[matchers] ; help[helpers]
  end
  app[apps/*/** unit + integration] --> shared
  pkg[packages/*/** unit] --> shared
  root[tests/ — @meshify/root-tests<br/>smoke · contracts · integration · e2e] --> shared
```

- **Unit tests** colocate with source (`*.test.ts`) and run under Vitest.
- **Shared fixtures/mocks/matchers** come from [`@meshify/testing`](../../packages/testing/README.md) — never redefined per suite.
- **Repository-wide** smoke/contract/integration/e2e tests live in `tests/`.

## Commands

```bash
pnpm test              # Turbo-orchestrated, cached, per-package + root
pnpm test:coverage     # single merged v8 report → coverage/
pnpm test:integration  # Testcontainers suites (Docker) — opt-in
pnpm test:e2e          # Playwright suites — opt-in
```

## Writing a test

```ts
import { InMemoryChatRepository, buildChat } from '@meshify/testing';

const chats = new InMemoryChatRepository({ chats: [buildChat({ id: 'a' })] });
// ...drive a use case with the in-memory port
```

## Best Practices
- Get entities from `@meshify/testing/factories`, ports from `/mocks`.
- Name by intent: `*.test.ts`, `*.integration.test.ts`, `*.e2e.test.ts`, `*.smoke.test.ts`, `*.contract.test.ts`.
- Unit-test **use cases** (they take ports); keep controllers thin.

## Common Mistakes
- Re-declaring a repository fake inline — use the shared in-memory repos.
- Putting an app unit test in `tests/` — that folder is repo-wide only.

## References
- [`TESTING.md`](../../TESTING.md), [`packages/testing`](../../packages/testing/README.md), root `vitest.config.ts`, `turbo.json`

## Related

- [RAG retrieval evaluation](rag-evaluation.md) - offline recall@k / MRR against a seeded project, gates retrieval changes
- [Contributing](../contributing/index.md)

## Next
- [Deployment & CI/CD](../operations/deployment.md).

---
[← Handbook](../README.md)
