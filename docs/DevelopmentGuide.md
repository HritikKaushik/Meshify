# Development Guide

## Prerequisites

Node 22+, pnpm 9 (via corepack), Docker. RocketRide access: `ROCKETRIDE_URI` + `ROCKETRIDE_APIKEY` (auto-synced to `.env` by the RocketRide VS Code extension in dev).

## First-time setup

```bash
cp .env.example .env      # fill ROCKETRIDE_APIKEY, ROCKETRIDE_OPENAI_KEY at minimum
pnpm install
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis qdrant minio minio-init rocketride
pnpm migrate              # applies packages/data-access/migrations/*.sql
pnpm --filter @meshify/rocketride-gateway check   # verifies RocketRide connectivity + validates pipeline shapes
```

## Daily loop

```bash
pnpm dev:api              # platform-api with hot reload (PLATFORM_PORT, default 3000)
pnpm dev:worker           # second terminal: BullMQ consumers
pnpm typecheck            # turbo run typecheck (cached)
pnpm test                 # turbo run test
pnpm build                # turbo run build
```

Turbo caches by content hash — a second identical run is near-instant. CI runs the same three tasks on every push/PR.

## Adding code

- **New domain module (platform-api):** create `src/modules/<domain>/{domain,application,infrastructure,interface}`. Use-cases take their dependencies via constructor (ports, not concretions); controllers are thin — parse/validate DTO, call use-case, map errors to status codes. Wire in `main.ts`.
- **New queue:** define name + payload type + job options in `@meshify/queues` (never inline in an app); producer in platform-api enqueues, processor lands in `apps/worker/src/processors/<queue>.processor.ts`. Jobs must be idempotent — BullMQ retries with backoff, and `pipeline_jobs` tracks status/attempts/last_error.
- **New schema change:** next-numbered file in `packages/data-access/migrations/` (`0003_*.sql`), additive-only within a release. The runner records applied files in `schema_migrations`.
- **Anything touching RocketRide:** goes in `@meshify/rocketride-gateway` — read `.rocketride/docs/` first (mandatory per the project rules), check component schemas in `.rocketride/schema/*.json` rather than guessing config fields, and expose capability through `RagPort`/builder functions, never by leaking SDK types.
- **New env var:** add to the zod schema in `packages/config/src/env.ts` (it fails fast at boot) and to `.env.example`. Never read `process.env` anywhere else.
- **New package:** only with ≥2 consumers (or one + a stated near-term second). Copy an existing package's `package.json`/`tsconfig.json` shape; add tsconfig `references` in consumers; add its COPY lines to any Dockerfile that consumes it.

## Testing

Vitest, colocated `*.test.ts`. Unit-test use-cases against fakes (`FakeRagService`, in-test repository fakes) — no live Postgres/RocketRide needed. Pipeline builders are pure functions: assert on the generated DAG JSON. Run everything with `pnpm test`.

## Verification beyond tests

The document-ingest path can be smoke-tested end to end with only Docker infra (RocketRide down is fine — the job fails cleanly with the connection error recorded in `pipeline_jobs.last_error`):

```bash
curl -X POST localhost:3000/v1/projects -H "content-type: application/json" -d '{"orgId":"<org-uuid>","name":"Test"}'
curl -X POST localhost:3000/v1/projects/<projectId>/documents -F "file=@README.md;type=text/markdown"
curl localhost:3000/v1/jobs/<jobId>
```

## Gotchas

- Never block the event loop in code sharing a process with the RocketRide client — its WebSocket keepalive times out after ~60s of a blocked loop (see ROCKETRIDE_COMMON_MISTAKES.md).
- BullMQ needs its own ioredis connection with `maxRetriesPerRequest: null`; don't reuse the health-check client.
- `ioredis` is pinned via `pnpm.overrides` — bullmq and app code must resolve the same version or their types conflict.
- Pipeline `project_id` fields are literal GUIDs stored on the `projects` row — never env-substituted (RocketRide reads them before substitution).
