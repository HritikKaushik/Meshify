# Local end-to-end testing (against the local RocketRide engine)

RocketRide's **cloud** requires a paid subscription to run workflows (and its
cloud file-upload pipe corrupts uploads — see Architecture "Known limitations").
The **local engine**, managed by the RocketRide VS Code extension, works — this
is the setup that runs ingestion + RAG chat end-to-end.

## Topology

Everything shares `localhost`, so `platform-api` and `worker` run **on the host**
(not in Docker) — that way the Qdrant host they embed in RocketRide pipelines
(`localhost`) is also reachable by the local engine, with no container↔host split.

```
host: RocketRide engine (extension) ─┐
host: platform-api + worker ─────────┼─ all talk over localhost
Docker (published to localhost): postgres:5433, redis:6379, qdrant:6333, minio:9000
```

## Steps

1. **Infra up** (Docker), everything except the apps:
   ```bash
   docker compose -f infrastructure/docker/docker-compose.yml -f infrastructure/docker/docker-compose.override.yml \
     up -d postgres redis qdrant minio minio-init
   ```

2. **RocketRide local**: in the extension, switch to local mode and open/run a
   pipeline so the engine starts. Find its port (OS-assigned, changes on restart):
   ```bash
   lsof -nP -iTCP -sTCP:LISTEN | grep 'engine' | grep -v ':2000'   # e.g. 56597
   ```
   Set `ROCKETRIDE_URI=http://localhost:<port>` in `.env`.

3. **`.env` for local** (already set up; cloud values kept as comments):
   `DATABASE_URL=…@localhost:5433`, `QDRANT_URL=http://localhost:6333`,
   `QDRANT_API_KEY=` (empty → RocketRide `local` profile), `ROCKETRIDE_URI` per above.

4. **Run the apps on the host** (source `.env` first — `loadEnv` reads `process.env`):
   ```bash
   pnpm --filter @meshify/data-access build && pnpm --filter @meshify/platform-api build && pnpm --filter @meshify/worker build
   set -a; . ./.env; set +a
   node apps/platform-api/dist/main.js &   # or: pnpm dev:api
   node apps/worker/dist/main.js &         # or: pnpm dev:worker
   ```

5. **Drive it** (issue a key, create a project, upload, chat) via the web console
   (`pnpm dev:web`) or curl. New projects provision RocketRide-compatible Qdrant
   collections automatically (see below).

## Why a fresh project is required

RocketRide only writes to a collection carrying its "schema" control document
(`QdrantCollectionProvisioner` now writes it at creation). Projects created
**before** that change have collections RocketRide rejects — create a new project
to test ingestion. If you switch `QDRANT_URL` between local and cloud, note that
collections live in whichever Qdrant was active at project-creation time.
