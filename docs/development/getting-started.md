---
title: Getting Started
purpose: Get a new engineer from clone to a running local stack.
audience: New hires and contributors.
owner: Platform Team
status: stable
last_updated: 2026-07-14
prerequisites:
  - Node 20+, pnpm 9, Docker (for Postgres/Redis/Qdrant/MinIO)
related:
  - ../reference/environment-variables.md
  - ../contributing/index.md
---

# Getting Started

> Clone → install → configure `.env` → migrate → run. All commands are run from
> the repo root and orchestrated by Turbo.

## Overview

Meshify is a pnpm workspace. `pnpm install` links all apps and packages; Turbo
runs build/test/typecheck across the graph. Local runtime dependencies
(Postgres, Redis, Qdrant, S3/MinIO) run in Docker.

## Prerequisites
- **Node 20+**, **pnpm 9** (`packageManager` is pinned in `package.json`).
- **Docker** for the stateful dependencies.
- Accounts/keys for **Clerk**, **RocketRide**, and a **GitHub App** (for repo ingestion).

## Setup

```bash
pnpm install                 # link the workspace
cp .env.example .env         # fill in the values (see below)
pnpm migrate                 # apply Postgres migrations
pnpm build                   # build packages (Turbo, cached)
```

### Configure `.env`
All env vars are validated at boot by [`packages/config/src/env.ts`](../../packages/config/src/env.ts).
See [Environment Variables](../reference/environment-variables.md) for the full,
grouped list. The web app additionally needs `VITE_CLERK_PUBLISHABLE_KEY` (read
from the same root `.env` via `apps/web/vite.config.ts`).

## Run

```bash
pnpm dev            # everything via Turbo
# or individually:
pnpm dev:api        # platform-api
pnpm dev:bff        # bff (browser-facing)
pnpm dev:worker     # worker (ingestion)
pnpm dev:web        # web SPA (Vite, proxies /api → bff)
```

## Verify

```bash
pnpm typecheck      # tsc across the workspace
pnpm test           # Turbo-orchestrated Vitest suites
pnpm test:coverage  # unified coverage report → coverage/
```

Health probes: `GET /health/live` (liveness) and `/health/ready` (readiness,
checks Postgres/Redis/Qdrant) on platform-api.

## Best Practices
- Keep one `.env` at the repo root — every app reads it (`envDir` points here).
- Run `pnpm migrate` after pulling changes that add migrations.
- Use `pnpm --filter <name> …` to target a single app/package.

## Common Mistakes
- Editing per-app `.env` files — there is one root `.env`.
- Skipping `pnpm migrate` and hitting "relation does not exist".
- Running `apps/web` without the BFF — `/api` calls will 404.

## Troubleshooting
| Symptom | Cause | Fix |
| --- | --- | --- |
| Boot throws on missing env | zod validation in `config` | Fill the reported var in `.env` |
| `/api` 404 in web | BFF not running | `pnpm dev:bff` |
| DB connection refused | Postgres not up | Start Docker deps |

## References
- Root `package.json` scripts, `turbo.json`, `.env.example`
- `packages/config/src/env.ts`

## Related
- [Environment Variables](../reference/environment-variables.md) · [Testing](../testing/index.md) · [Contributing](../contributing/index.md)

## Next
- [Contributing](../contributing/index.md) to make your first change.

---
[← Handbook](../README.md)
