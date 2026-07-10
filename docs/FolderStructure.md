# Folder Structure

```
root/
├── apps/                        Deployable processes. Apps may depend on packages; never the reverse.
│   ├── platform-api/            HTTP API (Express). src/modules/<domain>/{domain,application,infrastructure,interface}
│   ├── worker/                  BullMQ consumers. src/processors/<queue-name>.processor.ts
│   └── observability/           Single-instance DAP subscriber -> pipeline_runs/traces (cost, metrics, flow).
├── packages/                    Shared libraries. A package earns its existence by having ≥2 consumers
│   │                            (or one consumer + a concrete near-term second, stated in its header comment).
│   ├── config/                  zod env schema — the ONLY place process.env is read.
│   ├── data-access/             Postgres repositories + domain entities + migrations/ + migrate runner.
│   ├── object-storage/          S3-compatible client (MinIO/S3/R2/Spaces).
│   ├── queues/                  BullMQ queue names, payload types, retry defaults (producer+consumer share).
│   ├── vector-store/            Qdrant collection provisioning + direct search client.
│   ├── embeddings/              Query-time embedding providers (OpenAI now); ingest embeddings are RocketRide's job.
│   ├── github/                  GitHub App auth + read-only repo REST (tarball, compare, contents).
│   ├── shared/                  Logger; future: errors, constants. Content must be app-agnostic.
│   └── rocketride-gateway/      Anti-corruption layer: the ONLY package importing the RocketRide SDK.
│                                pipeline-builder/ (generates .pipe DAGs), client-pool, rag.service (RagPort impl),
│                                pipeline-registry, check.ts (RocketRide-mandated setup verifier).
├── infrastructure/
│   ├── docker/                  docker-compose.yml (local full-stack).
│   └── kubernetes/              Kustomize base + dev/prod overlays. platform-api
│                                (HPA/CPU), worker (KEDA/queue-depth), observability
│                                (single instance), migrate Job. See its README.
├── docs/                        This documentation set + DeadCodeReport.md.
├── .github/workflows/           CI (turbo typecheck/build/test).
├── turbo.json                   Task graph + caching.
├── pnpm-workspace.yaml          The single workspace definition (package.json has NO workspaces field).
└── tsconfig.base.json           Shared strict TS config; every package/app extends it.
```

## Rules

- **Dependency direction:** `apps → packages → (nothing)`. Verified acyclic; keep it that way.
- **Module anatomy (platform-api):** every domain module uses the same four folders — `domain/` (entities, ports; zero framework imports), `application/` (use-cases), `infrastructure/` (adapters), `interface/` (controllers, DTOs, guards, validation).
- **No placeholder directories.** `web/`, `ui/`, `auth/`, `terraform/` etc. appear when Phase II / the relevant step starts, not before.
- **No god-packages.** Types live beside the domain that owns them (in data-access), not in a central `types/` package. Generic `utils/` is banned until a concrete, shared, named utility exists.
- **Migrations** live in `packages/data-access/migrations/`, applied in filename order by `pnpm migrate`; schema and the code that speaks to it version together.
