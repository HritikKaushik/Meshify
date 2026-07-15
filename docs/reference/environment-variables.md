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
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SEC` | api | Per-key rate limiting |

### GitHub App (repo ingestion)
| Variable | Used by | Notes |
| --- | --- | --- |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET` | worker | Cloning + webhook verification |

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
| `PLATFORM_PORT`, `PLATFORM_LOG_LEVEL`, `PLATFORM_API_ORIGIN` | api / bff | API port, log level, proxy target |
| `BFF_PORT` | bff | BFF listen port |
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
