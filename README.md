# Meshify — Enterprise Knowledge Platform (Phase I: AI Platform)

AI platform for project-scoped RAG over source code, documents, and
repositories, with a React web workspace (`apps/web`) served through a
backend-for-frontend. Built around
[RocketRide](.rocketride/docs/ROCKETRIDE_README.md) for all LLM/embedding/RAG/agent
orchestration.

> **📖 Engineering documentation:** the canonical handbook lives at
> **[docs/README.md](docs/README.md)** — architecture, subsystems, AI/RAG,
> testing, operations, and per-package READMEs. Start there.

## Local bootstrap

```bash
cp .env.example .env   # fill in ROCKETRIDE_APIKEY, ROCKETRIDE_OPENAI_KEY at minimum
pnpm install

# start infra (Postgres, Redis, Qdrant, MinIO + bucket init, RocketRide)
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis qdrant minio minio-init rocketride

pnpm migrate            # applies packages/data-access/migrations/*.sql in order
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
docker compose -f infrastructure/docker/docker-compose.yml up -d --build
docker compose -f infrastructure/docker/docker-compose.yml up -d --scale worker=3   # scale worker horizontally
```

## Layout

```
apps/platform-api/              HTTP API (Clean Architecture: domain/application/infrastructure/interface per module)
apps/worker/                    BullMQ processors (document ingestion today; repo/sync/cleanup land in later steps)
packages/config/                zod-validated env schema — the only place process.env is read
packages/data-access/           Postgres repositories + entities + migrations/ + migrate runner
packages/object-storage/        S3-compatible client (MinIO locally, S3/R2/Spaces in prod)
packages/queues/                BullMQ queue definitions shared between producer (API) and consumer (worker)
packages/vector-store/          Qdrant collection provisioning
packages/shared/                cross-app logger (errors/constants as they appear)
packages/rocketride-gateway/    the only package allowed to import the RocketRide SDK
infrastructure/docker/          docker-compose.yml for local infra
docs/                           Architecture, FolderStructure, DevelopmentGuide, NamingConventions, Contributing
.rocketride/                    RocketRide docs + generated component catalog
```

Full documentation lives in the **[Engineering Handbook](docs/README.md)** —
start with [System Overview](docs/architecture/overview.md) and
[Getting Started](docs/development/getting-started.md).

## Workspace commands

- `pnpm dev:api` / `pnpm dev:worker` — run platform-api / worker with hot reload
- `pnpm migrate` — apply pending Postgres migrations
- `pnpm build` — build all packages/apps
- `pnpm typecheck` / `pnpm lint` — run across the workspace
- `pnpm --filter @meshify/rocketride-gateway check` — verify RocketRide connectivity + validate the generated pipeline shapes
