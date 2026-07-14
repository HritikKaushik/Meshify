---
title: Deployment, CI/CD & Observability
purpose: How Meshify is built, shipped, and observed in production.
audience: Operators, backend engineers, on-call.
owner: Platform Team
status: stable
last_updated: 2026-07-14
prerequisites:
  - ../architecture/overview.md
related:
  - troubleshooting.md
  - ../backend/queues-and-workers.md
---

# Deployment, CI/CD & Observability

> Five processes ship independently from one monorepo. Turbo caches builds and
> tests; every service exposes liveness/readiness; logs are structured and
> credential-safe.

## Overview

- **Build/test:** Turbo (`turbo.json`) with dependency-aware, cached tasks.
- **Deploy targets:** `apps/web` (static SPA behind the BFF/CDN), `apps/bff`, `apps/platform-api`, `apps/worker`, `apps/observability` — each a Node process; Kubernetes manifests live under `infrastructure/`.
- **Dependencies:** Postgres, Redis, Qdrant, S3-compatible storage, RocketRide.

## Architecture

### CI/CD pipeline

```mermaid
flowchart LR
  pr[Pull request] --> install[pnpm install]
  install --> tc[turbo run typecheck]
  install --> build[turbo run build]
  install --> test[turbo run test<br/>cached + affected]
  test --> cov[vitest --coverage<br/>merged lcov]
  build --> images[build service images]
  images --> deploy[deploy per app]
```

Turbo restores unchanged packages from cache; `--filter=...[origin/main]` runs
only affected packages and their dependents. Migrations run as a pre-deploy step
(`pnpm migrate`).

### Runtime topology

```mermaid
flowchart TB
  cdn[CDN / static] --> web
  web --> bff
  bff --> api[platform-api]
  api --> pg[(Postgres)] & redis[(Redis)] & qdrant[(Qdrant)] & s3[(S3)]
  redis --> worker
  worker --> pg & s3 & qdrant
  obs[observability] --> pg
```

## Implementation

### Health & lifecycle
- **Liveness:** `GET /health/live` (process up, no deps).
- **Readiness:** `GET /health/ready` (checks Postgres/Redis/Qdrant) — gate rollouts on this.
- **Graceful shutdown:** each `main.ts` handles `SIGTERM`/`SIGINT`, closing queues, workers (drain in-flight), the RocketRide pool, Redis, and the pg pool.

### Observability
- **Structured logs:** `pino` via `@meshify/shared`, with `pino-http` request logging + correlation ids. Credentials are redacted (`packages/shared/src/logger.ts`).
- **Pipeline traces:** `apps/observability` consumes RocketRide pipeline events into `pipeline_runs` / `pipeline_run_traces`.
- **Metrics:** a Prometheus `/metrics` surface is the documented next step (queue depth, pipeline/search latency).

### Configuration
Validated at boot by `@meshify/config`; a bad/missing env var fails fast. See
[Environment Variables](../reference/environment-variables.md).

## Best Practices
- Gate deploys on `/health/ready`, not `/health/live`.
- Run migrations before rolling the API/worker.
- Scale the worker independently of the API (ingestion is the heavy path).

## Common Mistakes
- Rolling the API before applying migrations.
- Sharing one Redis connection between the health checker and BullMQ (BullMQ needs `maxRetriesPerRequest: null`).
- Deploying without the readiness gate.

## Troubleshooting
See [Troubleshooting](troubleshooting.md) for symptom → fix. Common: readiness
`503` means a downstream dependency is unreachable — the body names which.

## References
- `turbo.json`, `infrastructure/`, each `apps/*/src/main.ts`
- `apps/platform-api/src/modules/health/**`, `apps/observability/src/**`

## Related
- [Queues & Workers](../backend/queues-and-workers.md) · [Troubleshooting](troubleshooting.md)

## Next
- [Troubleshooting](troubleshooting.md).

---
[← Handbook](../README.md)
