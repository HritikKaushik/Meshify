# @meshify/testing

The single source of truth for Meshify's test infrastructure. Every app and
package imports fixtures, factories, mocks, matchers and helpers from here
instead of duplicating them.

Consumed **as source** (no build step) — Vitest resolves the TypeScript entry
points directly, so changes are picked up instantly.

## Entry points

| Import | Contents |
| --- | --- |
| `@meshify/testing` | everything (factories + mocks + helpers) |
| `@meshify/testing/factories` | deterministic entity builders (`buildProject`, `buildChat`, `buildDocument`, `buildRepository`, `buildMessage`, `buildRepoFile`, `buildChatSummary`) |
| `@meshify/testing/mocks` | full in-memory repository implementations (`InMemoryChatRepository`, `InMemoryDocumentRepository`, `InMemoryRepositoryRepository`, `InMemoryFileRepository`, `InMemoryProjectRepository`) |
| `@meshify/testing/helpers` | async helpers (`flushPromises`, `deferred`) |
| `@meshify/testing/matchers` | custom matchers (`toBeIsoDateString`) — registered via `/setup` |
| `@meshify/testing/setup` | Vitest `setupFiles` entry (registers matchers + global hooks) |

## Layout

```
src/
  factories/        # domain entity builders (in use)
  mocks/            # in-memory repository ports (in use)
  helpers/          # async/test helpers (in use)
  custom-matchers/  # expect.extend matchers (in use)
  setup/            # vitest setupFiles entry (in use)
  builders/         # request/DTO builders           (scaffold)
  fixtures/         # static shared fixtures          (scaffold)
  auth/             # API-key / Clerk session fakes   (scaffold)
  database/ redis/ qdrant/ bullmq/ rocketride/        # integration harnesses (scaffold — need Docker)
  msw/              # shared HTTP handlers            (scaffold — needs `msw`)
  testcontainers/   # container lifecycle helpers     (scaffold — needs Docker + `testcontainers`)
  utils/ shared/    # misc shared utilities           (scaffold)
```

Directories marked **scaffold** carry a README describing the intended contents
and the dependency/infra they require. They are brought online where the
infrastructure exists (CI with Docker, browsers for e2e) — see the repo-root
`TESTING.md` for the rollout plan — so the default `pnpm test` stays fast and
dependency-light.
