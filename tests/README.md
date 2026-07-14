# Repository-wide tests

This workspace holds **only cross-cutting tests that span more than one app or
package**. Application unit tests live with their app; package unit tests live
with their package. Nothing app-specific belongs here.

```
tests/
  smoke/        # fast "is the world sane" checks across the repo
  contracts/    # cross-boundary contracts (workspace conventions, API ↔ client shapes)
  integration/  # multi-service flows against real deps (Testcontainers) — `pnpm test:integration`
  e2e/          # full browser journeys (Playwright) — `pnpm test:e2e`
  performance/  # latency/throughput probes
  load/         # sustained-load scenarios
  security/     # authz / isolation / injection regression checks
  regression/   # pinned reproductions of past incidents
  fixtures/     # large shared fixtures
  mocks/        # repo-wide mocks (prefer @meshify/testing/mocks)
  factories/    # repo-wide factories (prefer @meshify/testing/factories)
  shared/       # helpers shared only between root suites
  setup/        # setup files for the root suites
  utils/        # misc utilities for the root suites
```

## Conventions

- Shared factories, mocks, matchers and helpers come from **`@meshify/testing`** —
  never redefine them here.
- `smoke` and `contracts` run in the default `pnpm test` (dep-light, fast).
- `integration` / `e2e` are **opt-in** (`pnpm test:integration`, `pnpm test:e2e`)
  because they need Docker / browsers; they are `cache:false` in Turbo.
- File suffixes signal intent and let CI select suites:
  `*.smoke.test.ts`, `*.contract.test.ts`, `*.integration.test.ts`, `*.e2e.test.ts`.
