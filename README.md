# Meshify — Enterprise Knowledge Platform (Phase I: AI Platform)

AI Backend-as-a-Service for project-scoped RAG over source code, documents, and
repositories. No frontend in this phase — API-only. Built around
[RocketRide](.rocketride/docs/ROCKETRIDE_README.md) for all LLM/embedding/RAG/agent
orchestration; see `ai-platform-architecture` (published artifact) for the full
design.

## Local bootstrap

```bash
cp .env.example .env   # fill in ROCKETRIDE_APIKEY, ROCKETRIDE_OPENAI_KEY at minimum
pnpm install

# start infra (Postgres, Redis, Qdrant, MinIO + bucket init, RocketRide)
docker compose -f infra/docker/docker-compose.yml up -d postgres redis qdrant minio minio-init rocketride

pnpm migrate            # applies infra/migrations/*.sql in order
pnpm dev:api            # starts platform-api on PLATFORM_PORT (default 3000)
pnpm dev:worker         # in a second terminal — starts the document-ingest worker
```

Verify:

```bash
curl localhost:3000/health/live   # process liveness, no dependency checks
curl localhost:3000/health/ready  # checks postgres, redis, qdrant

# create a project, then upload a document — the worker will pick it up off the
# document-ingest queue and run it through the project's RocketRide ingest pipeline
curl -X POST localhost:3000/v1/projects -H "content-type: application/json" \
  -d '{"orgId":"<existing-org-uuid>","name":"My Project"}'
curl -X POST localhost:3000/v1/projects/<projectId>/documents -F "file=@./README.md;type=text/markdown"
curl localhost:3000/v1/jobs/<jobId>   # poll ingestion status
```

Run everything in Docker instead (API + worker + all infra):

```bash
docker compose -f infra/docker/docker-compose.yml up -d --build
docker compose -f infra/docker/docker-compose.yml up -d --scale worker=3   # scale worker horizontally
```

## Layout

```
apps/platform-api/         HTTP API (Clean Architecture: domain/application/infrastructure/interface per module)
apps/worker/                 BullMQ processors (document ingestion today; repo/sync/cleanup land in later steps)
packages/config/               zod-validated env schema + SQL migration runner
packages/data-access/            shared Postgres repositories (projects, documents, pipeline_jobs) used by both apps
packages/object-storage/           S3-compatible client (MinIO locally, S3/R2/Spaces in prod)
packages/queues/                     BullMQ queue definitions shared between producer (API) and consumer (worker)
packages/rocketride-gateway/           the only package allowed to import the RocketRide SDK
infra/migrations/                       versioned SQL migrations (applied in filename order)
infra/docker/                             docker-compose.yml for local infra
.rocketride/                                RocketRide docs + generated component catalog
```

## Workspace commands

- `pnpm dev:api` / `pnpm dev:worker` — run platform-api / worker with hot reload
- `pnpm migrate` — apply pending Postgres migrations
- `pnpm build` — build all packages/apps
- `pnpm typecheck` / `pnpm lint` — run across the workspace
- `pnpm --filter @meshify/rocketride-gateway check` — verify RocketRide connectivity + validate the generated pipeline shapes
