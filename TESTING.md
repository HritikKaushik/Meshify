# Testing Architecture

A scalable, monorepo-native testing architecture built to support dozens of apps
and packages without duplicated infrastructure. Four clearly-separated layers:

| Layer | Location | Owns |
| --- | --- | --- |
| **Application tests** | `apps/<app>/**` | that app's unit + integration + e2e suites |
| **Package tests** | `packages/<pkg>/**` | that package's unit + integration suites |
| **Shared testing infra** | `packages/testing` (`@meshify/testing`) | factories, mocks, matchers, helpers, MSW/Testcontainers harnesses |
| **Repository-wide tests** | `tests/` (`@meshify/root-tests`) | smoke, contracts, cross-service integration, e2e |

**No package depends on another package's tests.** All shared test code lives in
`@meshify/testing` and is imported, never copied.

## The stack (standardized)

| Concern | Tool | Status |
| --- | --- | --- |
| Unit + integration | **Vitest** | ✅ in use (single framework, repo-wide) |
| Unified coverage | **@vitest/coverage-v8** | ✅ `pnpm test:coverage` → merged report in `coverage/` |
| Orchestration/caching | **Turbo** | ✅ `test` cached + dependency-aware; `test:integration` / `test:e2e` uncached |
| Shared fixtures/mocks | **@meshify/testing** | ✅ in use |
| API/network mocking | **MSW** | 🧩 scaffolded (`packages/testing/src/msw`) — bring online with web/BFF tests |
| Real-dependency integration | **Testcontainers** (pg/redis/qdrant) | 🧩 scaffolded (`packages/testing/src/testcontainers`) — needs Docker |
| Browser e2e | **Playwright** | 🧩 planned — `tests/e2e/`, `pnpm test:e2e` |

There is exactly one unit-test framework (Vitest). No Jest, Cypress, Mocha or
duplicate runners exist in the repo.

## Directory layout

```
packages/testing/               # @meshify/testing — single source of truth
  src/
    factories/                  # ✅ buildProject/Chat/Document/Repository/Message/RepoFile
    mocks/                      # ✅ InMemory{Chat,Document,Repository,File,Project}Repository
    helpers/                    # ✅ flushPromises, deferred
    custom-matchers/            # ✅ toBeIsoDateString (register via /setup)
    setup/                      # ✅ vitest setupFiles entry
    builders/ fixtures/ auth/ utils/ shared/          # scaffold
    database/ redis/ qdrant/ bullmq/ rocketride/      # integration harness scaffold
    msw/ testcontainers/                              # scaffold (need deps/Docker)

tests/                          # @meshify/root-tests — repo-wide only
  smoke/        ✅ fast sanity across the repo
  contracts/    ✅ workspace + cross-boundary contracts
  integration/  🧩 multi-service (Testcontainers) — pnpm test:integration
  e2e/          🧩 Playwright — pnpm test:e2e
  performance/ load/ security/ regression/            # by suffix, opt-in

apps/<app>/tests/               # per-app integration/e2e (unit tests colocate in src — see below)
```

### On colocated unit tests

Unit tests currently **colocate** with source as `*.test.ts` (the Vitest
default, also used at Vercel). This is intentional and kept: colocation keeps a
unit and its subject in sync and is trivially discoverable. The `tests/`
directories are reserved for suites that *don't* map to a single source file —
**integration, e2e, and repository-wide** tests. A follow-up can relocate unit
suites under `apps/<app>/tests/unit/**` behind a `@/` path alias if a stricter
separation is preferred; the shared package and configs already support both.

## Commands

```bash
pnpm test                 # Turbo-orchestrated, cached, per-package + root suites
pnpm test:coverage        # single merged v8 coverage report across the monorepo
pnpm test:watch           # Vitest watch (root)
pnpm test:integration     # Testcontainers suites (Docker required) — uncached
pnpm test:e2e             # Playwright suites (browsers required) — uncached

pnpm --filter @meshify/platform-api test   # one app in isolation
pnpm --filter @meshify/vector-store test   # one package in isolation
```

## Writing tests

```ts
import { InMemoryChatRepository, buildChat } from '@meshify/testing';

const chats = new InMemoryChatRepository({ chats: [buildChat({ id: 'a' })] });
```

- Get entities from `@meshify/testing/factories`, repositories from
  `@meshify/testing/mocks` — never redefine them.
- Name by intent so CI can select suites: `*.test.ts` (unit),
  `*.integration.test.ts`, `*.e2e.test.ts`, `*.smoke.test.ts`, `*.contract.test.ts`.
- Register shared matchers with `setupFiles: ['@meshify/testing/setup']` in a
  suite's Vitest config, or import `@meshify/testing/matchers` directly.

## CI/CD (Turborepo)

- **Caching** — `test` declares `inputs` (`src/**`, `tests/**`, config, manifest)
  and empty `outputs`, so unchanged packages are restored from cache.
- **Affected-only** — `turbo run test --filter=...[origin/main]` runs just the
  packages touched by a branch and their dependents.
- **Parallel + dependency-aware** — Turbo fans tests out across packages after
  `^build`, with per-package and per-app isolation.
- **Uncached side-effecting suites** — `test:integration` / `test:e2e` are
  `cache:false` (they touch Docker/browsers).
- **Coverage merge** — `pnpm test:coverage` runs Vitest once from the root with
  the shared config to emit one `lcov` + HTML report for the whole monorepo,
  ready to upload from CI.

## Rollout status

- ✅ `@meshify/testing` shared package (factories, in-memory repos, matchers, helpers).
- ✅ Duplicated inline repository fakes removed from platform-api use-case tests.
- ✅ Root `@meshify/root-tests` workspace with live smoke + contract suites.
- ✅ Unified v8 coverage, Turbo `test`/`test:integration`/`test:e2e` tasks, root scripts.
- 🧩 Next: MSW handlers + web unit tests; Testcontainers pg/redis/qdrant integration
  suites; Playwright e2e; migrate the remaining inline fakes onto `@meshify/testing`.
