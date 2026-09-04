# @meshify/web

The Meshify product frontend: a Vite + React single-page app. It signs users in
with Clerk, talks only to its own origin (`/api`, proxied to the BFF, which
holds the org API key), and renders the product screens: Project Home,
Documents, Repository, Slack, Integrations, Settings, and the RAG Chat with
the live Job Progress Center.

## Run

```bash
# 1. Backend up (from the repo root): infra + platform-api + bff.
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis qdrant minio minio-init platform-api bff

# 2. Clerk keys in the root .env (VITE_CLERK_PUBLISHABLE_KEY for this app; CLERK_* for the BFF).

# 3. Start the app; Vite proxies /api to the BFF (BFF_ORIGIN overrides the target).
pnpm --filter @meshify/web dev      # http://localhost:5174
```

## Test

```bash
pnpm --filter @meshify/web test     # vitest + jsdom + Testing Library
```

## Structure

- `src/App.tsx` - routes; every screen is a lazy chunk behind a route-level error boundary.
- `src/api.ts` - the typed API client (cookie session, same origin), SSE stream URLs.
- `src/ui.tsx` - `useAsync`, the request hook every page loads through (latest-run wins, data kept across refreshes).
- `src/components/jobs/` - the real-time Job Progress Center (one SSE connection per project, re-seeded after reconnects).
- `src/components/ui/` - shadcn/Radix primitives; `src/pages/` - the screens.

## Production

`apps/web/Dockerfile` builds the bundle and serves it with nginx
(`nginx.conf.template`): gzip, immutable hashed assets, security headers, a
Content-Security-Policy (`CSP_MODE=report-only` by default, `enforce` once a
real session shows no violations), and `/api` proxied to the BFF.
