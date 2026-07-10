# Naming Conventions

One convention, enforced everywhere. Consistency beats preference.

## Files

**kebab-case + role suffix.** The suffix states what the file is; the prefix states what it is about.

| Kind | Pattern | Example |
|---|---|---|
| Use-case | `<verb-noun>.usecase.ts` | `upload-document.usecase.ts` |
| Repository impl | `<tech>-<entity>.repository.ts` | `postgres-project.repository.ts` |
| Repository port | `<entity>.repository.ts` | `project.repository.ts` |
| Entity/types | `<entity>.entity.ts` | `pipeline-job.entity.ts` |
| Controller | `<domain>.controller.ts` | `documents.controller.ts` |
| Middleware/guard | `<name>.guard.ts` | `project-isolation.guard.ts` |
| Queue processor | `<queue>.processor.ts` | `document-ingest.processor.ts` |
| Queue definition | `<queue>.queue.ts` | `document-ingest.queue.ts` |
| Health checker | `<dep>.checker.ts` | `qdrant.checker.ts` |
| Service | `<name>.service.ts` | `rag.service.ts` |
| Port/interface module | `<name>.port.ts` | `rag.port.ts` |
| Test | `<file-under-test>.test.ts`, colocated | `upload-document.usecase.test.ts` |

**Why not PascalCase filenames** (`DocumentParser.ts`): case-only renames are hazardous across macOS (case-insensitive) ↔ Linux (case-sensitive) filesystems and Git; kebab-case is the dominant TS backend convention (NestJS et al.); and the whole repo already follows it uniformly.

## Code

- **Classes / interfaces / types / enums:** PascalCase — `UploadDocumentUseCase`, `RagPort`, `PipelineJobStatus`.
- **Functions / variables:** camelCase. Boolean names read as predicates (`isFinalAttempt`, `deduped`).
- **Constants:** SCREAMING_SNAKE for true module-level constants (`MAX_UPLOAD_BYTES`, `DOCUMENT_INGEST_QUEUE`).

## Everything else

- **Packages:** `@meshify/<kebab>`; directory name matches the unscoped part.
- **Database:** snake_case tables and columns; plural table names (`pipeline_jobs`).
- **Env vars:** SCREAMING_SNAKE. `ROCKETRIDE_*` is **reserved** for values RocketRide substitutes into pipelines or reads itself; platform-owned vars use their domain prefix (`PLATFORM_*`, `S3_*`, `GITHUB_APP_*`).
- **Routes:** `/v1/<plural-resource>` with kebab-case path segments.
- **Queues:** kebab-case names matching their processor file (`document-ingest`).
- **Git branches:** `feat/<module>-<topic>`, `fix/<topic>`, `refactor/<topic>`.

## Banned

`helper.ts`, `utils.ts`, `misc.ts`, `temp*`, `*2.ts`, `*-final.ts`, `new-*.ts` — if you cannot name a file by its single responsibility, the file has more than one.
