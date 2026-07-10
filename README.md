# Meshify — Enterprise Knowledge Platform (Phase I: AI Platform)

AI Backend-as-a-Service for project-scoped RAG over source code, documents, and
repositories. No frontend in this phase — API-only. Built around
[RocketRide](.rocketride/docs/ROCKETRIDE_README.md) for all LLM/embedding/RAG/agent
orchestration; see `ai-platform-architecture` (published artifact) for the full
design.

## Local bootstrap

```bash
cp .env.example .env   # fill in ROCKETRIDE_APIKEY at minimum
pnpm install

# start infra (Postgres, Redis, Qdrant, MinIO, RocketRide)
docker compose -f infra/docker/docker-compose.yml up -d postgres redis qdrant minio rocketride

pnpm migrate            # applies infra/migrations/*.sql in order
pnpm dev:api            # starts platform-api on PLATFORM_PORT (default 3000)
```

Verify:

```bash
curl localhost:3000/health/live   # process liveness, no dependency checks
curl localhost:3000/health/ready  # checks postgres, redis, qdrant
```

## Layout

```
apps/platform-api/    HTTP API (Clean Architecture: domain/application/infrastructure/interface per module)
packages/config/       zod-validated env schema + SQL migration runner
infra/migrations/       versioned SQL migrations (applied in filename order)
infra/docker/            docker-compose.yml for local infra
.rocketride/              RocketRide docs + generated component catalog
```

## Workspace commands

- `pnpm dev:api` — run platform-api with hot reload
- `pnpm migrate` — apply pending Postgres migrations
- `pnpm build` — build all packages/apps
- `pnpm typecheck` / `pnpm lint` — run across the workspace
