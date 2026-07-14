---
title: apps/bff
purpose: Backend-for-frontend — turns a Clerk session into an org API key and proxies to platform-api.
audience: Backend engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-14
related:
  - ../../docs/backend/auth.md
---

# @meshify/bff

The browser-facing gateway. The only service the web app talks to.

## Purpose & responsibilities
- Verify the **Clerk** session on `/api/*`.
- Resolve the session's org to its (encrypted) platform **API key** and inject it as `Authorization: Bearer …`.
- **1:1 stream-proxy** every `/api/v1/*` request to platform-api (multipart passes through byte-identical).

## Public API (HTTP)
`/api/health` (public), `/api/v1/*` (Clerk-authenticated proxy). See
`src/modules/proxy/platform-proxy.ts`.

## Dependencies
`@meshify/{config,shared,data-access}`, `@clerk/express`, `express`,
`http-proxy-middleware`, `pg`, `pino(-http)`.

## Consumers
`apps/web` (same-origin `/api` via the Vite dev proxy / production CDN).

## How to extend
Add proxy routing or session logic under `src/modules/{auth,proxy}`. Keep it a
thin credential-exchange + proxy; business logic belongs in platform-api.

## How to test
`pnpm --filter @meshify/bff test`.

## How to debug
- `pino-http` request logs (cookie/authorization redacted).
- Auth failures: check Clerk keys and the `clerk_org_links` mapping.

## Key files
`src/main.ts`, `src/modules/auth/**`, `src/modules/proxy/platform-proxy.ts`.

---
[← Handbook](../../docs/README.md)
