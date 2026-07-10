# @meshify/web — dev console

A minimal Vite + React SPA for exercising the whole platform-api by hand: API-key
auth, projects, document upload + job status, search, RAG chat, the evaluation
harness, and repositories.

**This is a developer tool, not the Phase II product.** It stores the API key in
the browser (`localStorage`) for convenience; the real Phase II frontend would
authenticate users properly.

## Run

```bash
# 1. Backend up (from repo root): infra + platform-api.
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis qdrant minio minio-init platform-api

# 2. Issue an API key (copy the printed msk_… value).
docker compose -f infrastructure/docker/docker-compose.yml run --rm --no-deps \
  platform-api node packages/data-access/dist/scripts/issue-api-key.js \
  --org-name "Dev" --key-name "console"

# 3. Start the console.
pnpm --filter @meshify/web dev      # http://localhost:5174
```

In the top bar, leave **API base URL** blank (requests go same-origin and Vite
proxies `/v1` and `/health` to the API) and paste the **API key**. Click
**Health**, then create a project and use the tabs.

To point at a remote/deployed API instead of the local proxy, set
`PLATFORM_API_ORIGIN` before `pnpm dev`, or type a full base URL in the bar
(note: a cross-origin API needs CORS, which platform-api does not enable yet).

## What works without RocketRide

Projects, upload (object storage + queue), job status, and **search** (real query
embedding) work against just the infra + API. **Chat, evaluation, and actual
ingestion** need the RocketRide server running (it ships via the IDE extension,
not the compose stack) — those tabs will surface a clear error otherwise.
