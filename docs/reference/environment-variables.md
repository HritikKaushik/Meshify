---
title: Environment Variables
purpose: The canonical, code-driven reference for every environment variable Meshify reads.
audience: Backend engineers, operators.
owner: Platform Team
status: stable
last_updated: 2026-07-14
prerequisites:
  - ../development/getting-started.md
related:
  - ../backend/auth.md
---

# Environment Variables

> **Single source of truth:** [`packages/config/src/env.ts`](../../packages/config/src/env.ts)
> validates every variable with zod at process start; a missing/invalid value
> fails fast. This page groups them by concern — the code is authoritative for
> types, defaults, and required/optional status.

## Overview

All backend apps call `loadEnv()` from `@meshify/config`. The web app reads
`VITE_*` values directly via Vite (`apps/web/vite.config.ts`, `envDir` = repo
root). Keep secrets in the root `.env` (git-ignored); commit only `.env.example`.

## Reference

### Datastores
| Variable | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | api, bff, worker, observability | Postgres connection string |
| `REDIS_URL` | api, worker | BullMQ + rate limiter |
| `QDRANT_URL`, `QDRANT_API_KEY` | api, worker | Vector store |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | api, worker | Object storage (MinIO locally) |

### AI / RocketRide
| Variable | Used by | Notes |
| --- | --- | --- |
| `ROCKETRIDE_URI`, `ROCKETRIDE_APIKEY` | api, worker, observability | Gateway connection |
| `ROCKETRIDE_OPENAI_KEY`, `ROCKETRIDE_GEMINI_KEY` | api, worker | Embedding/LLM provider keys |

### Auth & security
| Variable | Used by | Notes |
| --- | --- | --- |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | bff | Session verification |
| `PLATFORM_API_KEY_PEPPER` | api | HMAC pepper for API-key hashing |
| `ORG_KEY_ENCRYPTION_KEY` | bff, api, worker | Encrypts org API keys at rest; also signs Slack OAuth `state` + encrypts Slack tokens |
| `METRICS_TOKEN` | api, worker | Bearer token the scraper sends to `/metrics`; at least 16 chars, required in production (empty leaves `/metrics` open in dev only) |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SEC` | api | Requests per window per end user (BFF traffic) or per API key (direct callers) |
| `RATE_LIMIT_KEY_MAX` | api | Ceiling per window across every user sharing one API key (default 1200) |
| `PIPELINE_RUN_RETENTION_DAYS`, `AUDIT_LOG_RETENTION_DAYS` | worker | Daily retention sweeps: pipeline runs/traces (default 30) and audit log entries (default 365) older than this are deleted |
| `TRUST_PROXY_HOPS` | api, bff | Proxy hops trusted when reading the client IP from `X-Forwarded-For` (api: 1 = the BFF; bff on Render: 2 = web nginx + load balancer) |

### GitHub App (managed provider registration)
These form the deployment's **managed** GitHub registration. The managed provider is only offered when the full set (App ID, slug, private key, **and** OAuth client ID + secret) is present — without the client credentials, installation ownership can't be verified during connect, so the provider fails closed rather than expose an unverifiable flow. Orgs can instead register their own GitHub App (BYOA) with the same field set through the platform UI.

| Variable | Used by | Notes |
| --- | --- | --- |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG` | api, worker | App identity; slug drives the install URL |
| `GITHUB_APP_PRIVATE_KEY` | api, worker | Installation-token signing (JWT) |
| `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` | api | User-authorization OAuth; used to verify the connecting user actually owns the installation (anti cross-tenant claim) |
| `GITHUB_APP_WEBHOOK_SECRET` | api, worker | HMAC verification of inbound webhook deliveries |

### Slack connector (conversation ingestion)
| Variable | Used by | Notes |
| --- | --- | --- |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | api | OAuth app credentials (optional; enables the Slack source) |
| `SLACK_REDIRECT_URI` | api | Static URL registered on the Slack app → web `/oauth/slack/callback` |
| `SLACK_SIGNING_SECRET` | api | Reserved for a future Events API receiver (unused by history-timestamp sync) |

### Process & networking
| Variable | Used by | Notes |
| --- | --- | --- |
| `NODE_ENV` | all | `development` / `production` |
| `PLATFORM_PORT`, `PLATFORM_LOG_LEVEL` | api | API port, log level |
| `PLATFORM_API_ORIGIN` | bff | Proxy target: a full URL, or a bare `host:port` (defaulted to `http://` - the form a Render Blueprint `fromService: hostport` reference yields) |
| `BFF_PORT` | bff | BFF listen port |
| `PORT` | api, bff, web | When a PaaS injects it, the process binds `PORT` instead of `PLATFORM_PORT` / `BFF_PORT` (nginx likewise) |
| `BFF_UPSTREAM` | web (nginx) | Where `/api` is proxied: a full URL or a bare `host:port` (scheme added by `nginx.conf.template`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | web | Read by Vite, not `config` |

## Best Practices
- Add a new variable to `env.ts` (with a zod validator) **and** `.env.example` in the same PR.
- Never read `process.env` directly in feature code — go through `@meshify/config`.
- Treat every key/secret above as sensitive; they are redacted from logs.

## Common Mistakes
- Reading `process.env.X` in an app instead of the validated `env` object.
- Committing real secrets — only `.env.example` is tracked.

## References
- `packages/config/src/env.ts`, `.env.example`, `apps/web/vite.config.ts`

## Related
- [Getting Started](../development/getting-started.md) · [Auth](../backend/auth.md)

## Next
- [Glossary](glossary.md).

---
[← Handbook](../README.md)
