# Graph Report - .  (2026-07-13)

## Corpus Check
- Corpus is ~42,734 words - fits in a single context window. You may not need a graph.

## Summary
- 1418 nodes · 2280 edges · 138 communities (81 shown, 57 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.79)
- Token cost: 132,903 input · 0 output

## Community Hubs (Navigation)
- Pipeline Builder Extension
- RocketRide VS Code Panels/API
- Worker App Dependencies
- Pipeline Runs (DAP Events)
- Observability App Dependencies
- Chat Interface/Bootstrap
- Document Ingestion Entities
- Repo Document-Ingest Processors
- Projects Domain
- RocketRide Gateway Dependencies
- Pipeline Jobs Domain
- Connect GitHub Repository Flow
- Web Console Dependencies
- Data-Access Package Dependencies
- Health Check / Infrastructure
- Repositories Domain
- Chats Domain (Entities)
- Search & Embedding Provider
- Create Project Flow
- Web Console TS Config
- Org Existence Checks
- Turborepo Root Config
- API Keys Domain
- Files Domain
- Object Storage (S3) Config
- Config Package Dependencies
- Embeddings Package Dependencies
- Embedding Provider Implementation
- GitHub App Auth
- Queues Package Dependencies (BullMQ)
- Shared Package Dependencies (Pino)
- Vector Store Package Dependencies
- Platform API Dependencies
- Project Isolation Guard Tests
- Evaluation Harness
- Base TS Config
- Platform API TS Tooling
- API Key Authentication Flow
- GitHub Package Dependencies
- Chat Pipeline Resolver (RocketRide)
- Docker/CI Image Build
- Ask Question Use Case
- K8s Base Manifests
- Turborepo Task Config
- Ask Question Use Case (Retry)
- Chat Not Found Error Handling
- Platform API TS Config
- Observability TS Config
- Redis Rate Limiter
- Worker TS Config
- Document Ingest Queue
- RocketRide Gateway TS Config
- API Key Generation Scripts
- Embeddings TS Config
- Vector Store TS Config
- Evaluation Harness (Docs)
- Audit Log Domain
- Data-Access TS Config
- RocketRide Standards Checklist
- Config Package TS Config
- GitHub Package TS Config
- Object Storage TS Config
- Queues Package TS Config
- Shared Package TS Config
- Upload Document Use Case
- Platform API Build Scripts
- RAG Prompt / Chat Pipeline (Docs)
- Search Path Bypasses RocketRide (Docs)
- AI Platform Architecture Decisions
- Env Schema Validation
- Pipeline Templates (chat/ingest.pipe)
- Platform API Package Metadata
- RocketRide Local Engine / Qdrant Service
- DB Migration Runner
- Logger Utility
- Web Console Dev Entry Point
- K8s Autoscaling (HPA/KEDA)
- Kubernetes Deployment Model (Docs)
- Qdrant Collection Provisioning (Docs)
- Pipeline Config Dead Code (Docs)
- Platform API - Config Dependency
- Platform API - Data-Access Dependency
- Platform API - Embeddings Dependency
- Platform API - Queues Dependency
- Platform API - Shared Dependency
- Platform API - Multer Dependency
- Platform API - Postgres Dependency
- Platform API - Pino Dependency
- RocketRide Gotchas (Docs)
- RocketRide Setup Verifier (Docs)
- RocketRide Pipeline Builder Overview
- API Key Pepper Rotation (Docs)
- Queues/Worker Package Refs (Docs)
- RocketRide Component Reference (Docs)
- RocketRide Observability Docs
- RocketRide Pipeline Rules Docs
- RocketRide Python API Docs
- RocketRide Quickstart Docs
- RocketRide TypeScript API Docs
- Audit Logs Table (Docs)
- GitHub App Repo Ingestion (Docs)
- Object Storage S3/MinIO (Docs)
- Physical Tenant Isolation (Docs)
- Pipeline-Per-Project Design (Docs)
- PostgreSQL (Docs)
- Project Isolation Guard (Docs)
- Qdrant (Docs)
- Redis/BullMQ (Docs)
- Commit Conventions (Docs)
- PR Guidelines (Docs)
- Trunk-Based Development (Docs)
- Daily Dev Loop (Docs)
- Testing Conventions (Docs)
- Config Package Reference (Docs)
- Data-Access Package Reference (Docs)
- GitHub Package Reference (Docs)
- Infrastructure Folder Reference (Docs)
- Object Storage Package Reference (Docs)
- Observability App Reference (Docs)
- Shared Packages Overview (Docs)
- Shared Package Reference (Docs)
- Web App Reference (Docs)
- Banned Filenames Convention (Docs)
- Code Naming Conventions (Docs)
- RocketRide Common Mistakes (Copilot)
- RocketRide Component Reference (Copilot)
- RocketRide Observability (Copilot)
- RocketRide Pipeline Rules (Copilot)
- RocketRide Python API (Copilot)
- RocketRide Quickstart (Copilot)
- RocketRide README (Copilot)
- RocketRide TypeScript API (Copilot)
- CI Workflow
- Meshify Namespace
- K8s Overlays (Dev/Prod)
- Platform API App (README)
- Worker App - Document Ingest (README)

## God Nodes (most connected - your core abstractions)
1. `MeshifyApi` - 25 edges
2. `projectIsolationGuard()` - 16 edges
3. `compilerOptions` - 16 edges
4. `useAsync()` - 15 edges
5. `buildIngestPipeline()` - 15 edges
6. `compilerOptions` - 14 edges
7. `bootstrap()` - 13 edges
8. `RocketRideClientPool` - 13 edges
9. `buildChatPipeline()` - 13 edges
10. `GetProjectUseCase` - 12 edges

## Surprising Connections (you probably didn't know these)
- `RocketRide (AI Pipeline Builder)` --semantically_similar_to--> `RocketRide (AI Pipeline Builder)`  [INFERRED] [semantically similar]
  .github/copilot-instructions.md → .claude/rules/rocketride.md
- `platform-api service` --conceptually_related_to--> `meshify-platform-api image`  [INFERRED]
  infrastructure/docker/docker-compose.yml → .github/workflows/ci.yml
- `Meshify — Enterprise Knowledge Platform` --references--> `First-time setup`  [EXTRACTED]
  README.md → docs/DevelopmentGuide.md
- `infrastructure/docker/docker-compose.yml (referenced from README)` --references--> `platform-api service`  [EXTRACTED]
  README.md → infrastructure/docker/docker-compose.yml
- `docker-compose.yml (referenced from web README)` --references--> `platform-api service`  [EXTRACTED]
  apps/web/README.md → infrastructure/docker/docker-compose.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Mandatory RocketRide setup docs read before coding** — claude_rules_rocketride_readme, github_copilot_instructions_readme, docs_deadcodereport_check_ts, docs_developmentguide_rocketride_gateway [INFERRED 0.85]
- **Search and chat retrieval bypass RocketRide's qdrant/prompt nodes** — docs_architecture_search_path, docs_architecture_chat_retrieval_path, docs_architecture_qdrant, docs_architecture_vector_store_package [INFERRED 0.85]
- **The three deployable Meshify images built by CI and run via docker-compose** — infrastructure_docker_docker_compose_platform_api, infrastructure_docker_docker_compose_worker, infrastructure_docker_docker_compose_observability, github_workflows_ci_images_job [EXTRACTED 1.00]
- **Shared meshify-config/meshify-secrets across all core workloads** — infrastructure_kubernetes_base_migrate_job_meshifymigrate, infrastructure_kubernetes_base_platform_api_deployment_platformapi, infrastructure_kubernetes_base_worker_deployment_worker, infrastructure_kubernetes_base_observability_deployment_observability [INFERRED 0.95]
- **Dev overlay patch set (HPA, Deployment, ScaledObject, PDBs downsized/removed for low-footprint dev)** — infrastructure_kubernetes_overlays_dev_kustomization_dev, infrastructure_kubernetes_base_platform_api_hpa_platformapi, infrastructure_kubernetes_base_platform_api_deployment_platformapi, infrastructure_kubernetes_base_worker_keda_scaledobject_worker, infrastructure_kubernetes_base_pdb_platformapi, infrastructure_kubernetes_base_pdb_worker [EXTRACTED 1.00]

## Communities (138 total, 57 thin omitted)

### Community 0 - "Pipeline Builder Extension"
Cohesion: 0.07
Nodes (45): consoleLogger, main(), ClientPoolLogger, RocketRideClientPool, main(), OUT_DIR, qdrant(), buildChatPipeline() (+37 more)

### Community 1 - "RocketRide VS Code Panels/API"
Cohesion: 0.08
Nodes (38): ApiConfig, ApiError, ChatCitation, ChatResponse, EvaluationReport, GoldenCase, HealthReport, Job (+30 more)

### Community 2 - "Worker App Dependencies"
Cohesion: 0.04
Nodes (48): adm-zip, dependencies, adm-zip, bullmq, ioredis, @meshify/config, @meshify/data-access, @meshify/github (+40 more)

### Community 3 - "Pipeline Runs (DAP Events)"
Cohesion: 0.10
Nodes (13): DapEvent, DapEventHandler, Logger, num(), projectId(), noopLogger, unixToDate(), bootstrap() (+5 more)

### Community 4 - "Observability App Dependencies"
Cohesion: 0.06
Nodes (32): dependencies, @meshify/config, @meshify/data-access, @meshify/rocketride-gateway, @meshify/shared, pg, devDependencies, tsx (+24 more)

### Community 5 - "Chat Interface/Bootstrap"
Cohesion: 0.14
Nodes (19): bootstrap(), askSchema, createChatController(), createDocumentsController(), upload, goldenCaseSchema, RunEvaluationDto, runEvaluationSchema (+11 more)

### Community 6 - "Document Ingestion Entities"
Cohesion: 0.11
Nodes (13): ALLOWED_MIME_TYPES, Document, DocumentSourceType, DocumentStatus, EXTENSION_TO_SOURCE_TYPE, sourceTypeFromFilename(), CreateDocumentInput, DocumentRepository (+5 more)

### Community 7 - "Repo Document-Ingest Processors"
Cohesion: 0.15
Nodes (23): bootstrap(), DocumentIngestProcessorDeps, processDocumentIngestJob(), processRepoIngestJob(), RepoIngestProcessorDeps, toBatches(), toIngestFile(), processRepoSyncJob() (+15 more)

### Community 8 - "Projects Domain"
Cohesion: 0.15
Nodes (14): PostgresProjectRepository, ProjectRow, toDomain(), apiKeyEnvVarFor(), EMBEDDING_DIMENSIONS, embeddingDimensionFor(), embeddingProviderFromProfile(), llmProviderFromProfile() (+6 more)

### Community 9 - "RocketRide Gateway Dependencies"
Cohesion: 0.07
Nodes (26): dependencies, @meshify/config, rocketride, devDependencies, tsx, @types/node, typescript, vitest (+18 more)

### Community 10 - "Pipeline Jobs Domain"
Cohesion: 0.14
Nodes (8): PipelineJob, PipelineJobStatus, PipelineJobType, CreatePipelineJobInput, PipelineJobRepository, PipelineJobRow, PostgresPipelineJobRepository, toDomain()

### Community 11 - "Connect GitHub Repository Flow"
Cohesion: 0.11
Nodes (12): ConnectGitHubRepositoryCommand, ConnectGitHubRepositoryUseCase, ConnectRepositoryResult, ListRepositoriesUseCase, RepositoryNotFoundError, SyncRepositoryUseCase, UploadRepositoryZipCommand, UploadRepositoryZipUseCase (+4 more)

### Community 12 - "Web Console Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, react, react-dom, devDependencies, @types/react, @types/react-dom, typescript, vite (+17 more)

### Community 13 - "Data-Access Package Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, @meshify/config, pg, devDependencies, tsx, @types/node, @types/pg, typescript (+17 more)

### Community 14 - "Health Check / Infrastructure"
Cohesion: 0.15
Nodes (9): CheckHealthUseCase, HealthReport, DependencyChecker, DependencyCheckResult, DependencyStatus, PostgresChecker, QdrantChecker, RedisChecker (+1 more)

### Community 15 - "Repositories Domain"
Cohesion: 0.16
Nodes (9): PostgresRepositoryRepository, RepositoryRow, toDomain(), parseGitHubUrl(), Repository, RepositorySource, RepositorySyncStatus, CreateRepositoryInput (+1 more)

### Community 16 - "Chats Domain (Entities)"
Cohesion: 0.19
Nodes (12): Chat, Message, MessageCitation, MessageRole, ChatRepository, CreateChatInput, CreateMessageInput, ChatRow (+4 more)

### Community 17 - "Search & Embedding Provider"
Cohesion: 0.14
Nodes (12): EmbeddingProviderFactory, SearchCommand, SearchResponse, fakeEmbeddings, PROJECT, hitToItem(), mergeAndRank(), RocketRideMeta (+4 more)

### Community 18 - "Create Project Flow"
Cohesion: 0.12
Nodes (12): CreateProjectCommand, CreateProjectUseCase, OrgNotFoundError, COMMAND, ProvisionerCall, DeleteProjectUseCase, ProjectNotFoundError, CreateProjectDto (+4 more)

### Community 19 - "Web Console TS Config"
Cohesion: 0.09
Nodes (22): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module, moduleResolution (+14 more)

### Community 20 - "Org Existence Checks"
Cohesion: 0.15
Nodes (6): QdrantCollectionProvisioner, Call, buildQdrantFilter(), QdrantSearchClient, QdrantSearchHit, SearchFilters

### Community 21 - "Turborepo Root Config"
Cohesion: 0.09
Nodes (21): devDependencies, turbo, vitest, turbo, vitest, name, ioredis, packageManager (+13 more)

### Community 22 - "API Keys Domain"
Cohesion: 0.16
Nodes (7): ApiKey, ActiveApiKey, ApiKeyRepository, CreateApiKeyInput, ApiKeyRow, PostgresApiKeyRepository, toDomain()

### Community 23 - "Files Domain"
Cohesion: 0.20
Nodes (7): FileStatus, RepoFile, FileRepository, UpsertFileInput, FileRow, PostgresFileRepository, toDomain()

### Community 24 - "Object Storage (S3) Config"
Cohesion: 0.11
Nodes (17): @aws-sdk/client-s3, dependencies, @aws-sdk/client-s3, devDependencies, @types/node, typescript, @types/node, typescript (+9 more)

### Community 25 - "Config Package Dependencies"
Cohesion: 0.11
Nodes (17): dependencies, zod, devDependencies, @types/node, typescript, @types/node, typescript, zod (+9 more)

### Community 26 - "Embeddings Package Dependencies"
Cohesion: 0.11
Nodes (17): devDependencies, @types/node, typescript, vitest, @types/node, typescript, vitest, main (+9 more)

### Community 27 - "Embedding Provider Implementation"
Cohesion: 0.27
Nodes (8): EmbeddingProvider, MissingEmbeddingKeyError, UnsupportedEmbeddingProfileError, createEmbeddingProvider(), EmbeddingKeys, isOpenAiEmbeddingProfile(), OPENAI_EMBEDDING_PROFILES, OpenAiEmbeddingProvider

### Community 28 - "GitHub App Auth"
Cohesion: 0.21
Nodes (6): base64url(), GitHubAppAuth, GitHubAppConfig, ComparedFile, GitHubRepoClient, RepoHead

### Community 29 - "Queues Package Dependencies (BullMQ)"
Cohesion: 0.11
Nodes (17): dependencies, bullmq, devDependencies, @types/node, typescript, bullmq, @types/node, typescript (+9 more)

### Community 30 - "Shared Package Dependencies (Pino)"
Cohesion: 0.11
Nodes (17): dependencies, pino, devDependencies, @types/node, typescript, pino, @types/node, typescript (+9 more)

### Community 31 - "Vector Store Package Dependencies"
Cohesion: 0.11
Nodes (17): devDependencies, @types/node, typescript, vitest, @types/node, typescript, vitest, main (+9 more)

### Community 32 - "Platform API Dependencies"
Cohesion: 0.12
Nodes (17): dependencies, bullmq, express, ioredis, @meshify/object-storage, @meshify/rocketride-gateway, @meshify/vector-store, pino-http (+9 more)

### Community 33 - "Project Isolation Guard Tests"
Cohesion: 0.21
Nodes (9): req(), auditLogMiddleware(), clientIp(), NON_MUTATING, resourceTypeFrom(), AUTH, mockRequest(), mockResponse() (+1 more)

### Community 34 - "Evaluation Harness"
Cohesion: 0.25
Nodes (8): EvaluationReport, RunEvaluationUseCase, CaseResult, CheckResult, evaluateAnswer(), EvaluatedAnswer, GoldenCase, includesCI()

### Community 35 - "Base TS Config"
Cohesion: 0.12
Nodes (15): compilerOptions, composite, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+7 more)

### Community 36 - "Platform API TS Tooling"
Cohesion: 0.13
Nodes (15): devDependencies, tsx, @types/express, @types/multer, @types/node, @types/pg, typescript, vitest (+7 more)

### Community 37 - "API Key Authentication Flow"
Cohesion: 0.21
Nodes (6): AuthenticateApiKeyUseCase, AuthenticationError, extractBearer(), authGuard(), Express, Request

### Community 38 - "GitHub Package Dependencies"
Cohesion: 0.13
Nodes (14): devDependencies, @types/node, typescript, @types/node, typescript, main, name, private (+6 more)

### Community 39 - "Chat Pipeline Resolver (RocketRide)"
Cohesion: 0.18
Nodes (5): ChatPipelineResolver, RocketRideChatPipelineResolver, NO_CONTEXT, PROJECT, resolver

### Community 40 - "Docker/CI Image Build"
Cohesion: 0.19
Nodes (14): docker-compose.override.yml, Local end-to-end topology (host + Docker), images job (build & push), meshify-observability image, meshify-platform-api image, verify job (typecheck/build/test), meshify-worker image, minio service (+6 more)

### Community 41 - "Ask Question Use Case"
Cohesion: 0.31
Nodes (7): AskQuestionCommand, AskQuestionResult, ChatContextRetriever, buildRagPrompt(), DEFAULT_INSTRUCTIONS, RetrievedChunk, VectorSearchContextRetriever

### Community 42 - "K8s Base Manifests"
Cohesion: 0.28
Nodes (13): Job: meshify-migrate, packages/data-access/dist/migrate.js (schema migration runner), Deployment: observability (DAP event ingester, single replica), PodDisruptionBudget: platform-api, PodDisruptionBudget: worker, Deployment: platform-api, HorizontalPodAutoscaler: platform-api, Ingress: platform-api (+5 more)

### Community 43 - "Turborepo Task Config"
Cohesion: 0.18
Nodes (12): ^build, dist/**, dependsOn, outputs, $schema, tasks, build, lint (+4 more)

### Community 44 - "Ask Question Use Case (Retry)"
Cohesion: 0.23
Nodes (3): AskQuestionUseCase, CODE_EXTENSIONS, extractReferencedCodeFiles()

### Community 45 - "Chat Not Found Error Handling"
Cohesion: 0.17
Nodes (5): ChatNotFoundError, FakeChatRepository, fakeResolver, NO_CONTEXT, PROJECT

### Community 46 - "Platform API TS Config"
Cohesion: 0.17
Nodes (11): compilerOptions, outDir, rootDir, exclude, extends, include, src, src/**/*.test.ts (+3 more)

### Community 47 - "Observability TS Config"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, src, src/**/*.test.ts (+2 more)

### Community 48 - "Redis Rate Limiter"
Cohesion: 0.25
Nodes (4): RateLimitDecision, RedisRateLimiter, RateLimiter, rateLimitGuard()

### Community 49 - "Worker TS Config"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, src, src/**/*.test.ts (+2 more)

### Community 50 - "Document Ingest Queue"
Cohesion: 0.38
Nodes (7): createDocumentIngestQueue(), DocumentIngestJobPayload, DEFAULT_JOB_OPTS, createRepoIngestQueue(), createRepoSyncQueue(), RepoIngestJobPayload, RepoSyncJobPayload

### Community 51 - "RocketRide Gateway TS Config"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, src, src/**/*.test.ts (+2 more)

### Community 52 - "API Key Generation Scripts"
Cohesion: 0.33
Nodes (8): AuthContext, generateApiKey(), hashApiKey(), hashesEqual(), looksLikeApiKey(), main(), parseArgs(), resolveOrgId()

### Community 53 - "Embeddings TS Config"
Cohesion: 0.20
Nodes (9): compilerOptions, outDir, rootDir, exclude, extends, include, src, src/**/*.test.ts (+1 more)

### Community 54 - "Vector Store TS Config"
Cohesion: 0.20
Nodes (9): compilerOptions, outDir, rootDir, exclude, extends, include, src, src/**/*.test.ts (+1 more)

### Community 55 - "Evaluation Harness (Docs)"
Cohesion: 0.22
Nodes (9): Evaluation harness, FakeRagService, RagPort, RunEvaluationUseCase, FakeRagService (kept, test seam), Adding code guidance, RagPort (dev guide reference), @meshify/rocketride-gateway (dev guide reference) (+1 more)

### Community 56 - "Audit Log Domain"
Cohesion: 0.42
Nodes (3): AuditLogEntry, AuditLogRepository, PostgresAuditLogRepository

### Community 57 - "Data-Access TS Config"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json, references

### Community 58 - "RocketRide Standards Checklist"
Cohesion: 0.25
Nodes (7): @meshify/rocketride-gateway, Standards checklist, apps/ (deployable processes), apps/platform-api, packages/rocketride-gateway, File naming: kebab-case + role suffix, Why not PascalCase filenames

### Community 59 - "Config Package TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 60 - "GitHub Package TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 61 - "Object Storage TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 62 - "Queues Package TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 63 - "Shared Package TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 64 - "Upload Document Use Case"
Cohesion: 0.33
Nodes (3): UploadDocumentCommand, UploadDocumentResult, UploadDocumentUseCase

### Community 65 - "Platform API Build Scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, typecheck

### Community 66 - "RAG Prompt / Chat Pipeline (Docs)"
Cohesion: 0.33
Nodes (6): AskQuestionUseCase, buildRagPrompt, chat-pipeline.ts, Chat retrieval path (bypasses RocketRide), ChatContextRetriever, VectorSearchContextRetriever

### Community 67 - "Search Path Bypasses RocketRide (Docs)"
Cohesion: 0.33
Nodes (6): @meshify/embeddings, Search path (bypasses RocketRide), search-result.ts, @meshify/vector-store, packages/embeddings, packages/vector-store

### Community 68 - "AI Platform Architecture Decisions"
Cohesion: 0.33
Nodes (6): Meshify Phase I: AI Backend-as-a-Service, Settled decisions policy, ai-platform-architecture (published design artifact), infrastructure/docker/docker-compose.yml (referenced from README), Meshify — Enterprise Knowledge Platform, RocketRide (linked from README)

### Community 69 - "Env Schema Validation"
Cohesion: 0.53
Nodes (4): Env, envSchema, loadEnv(), resetEnvCache()

### Community 70 - "Pipeline Templates (chat/ingest.pipe)"
Cohesion: 0.47
Nodes (6): chat.pipe (RAG chat template), ingest.pipe (document/code ingestion template), Multi-tenant pipeline generation (per-project pipeline + Qdrant collections), packages/rocketride-gateway/src/pipeline-builder (runtime pipeline builders), RocketRide VS Code extension (pipeline inspection/debugging workflow), pnpm workspace package globs (apps/*, packages/*)

### Community 71 - "Platform API Package Metadata"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 72 - "RocketRide Local Engine / Qdrant Service"
Cohesion: 0.40
Nodes (5): RocketRide server, RocketRide local engine (VS Code extension), qdrant service, meshify-config ConfigMap, kustomization.yaml resources list

### Community 73 - "DB Migration Runner"
Cohesion: 0.60
Nodes (4): appliedMigrations(), ensureMigrationsTable(), main(), MIGRATIONS_DIR

### Community 74 - "Logger Utility"
Cohesion: 0.70
Nodes (3): createLogger(), Logger, LoggerOptions

### Community 75 - "Web Console Dev Entry Point"
Cohesion: 0.50
Nodes (4): Meshify Console (dev) entry point, @meshify/web dev console, docker-compose.yml (referenced from web README), RocketRide IDE extension (ships RocketRide server)

### Community 76 - "K8s Autoscaling (HPA/KEDA)"
Cohesion: 0.50
Nodes (4): kubernetes/base (namespaced workloads), HPA (platform-api CPU autoscaling), KEDA (worker queue-depth autoscaling), migrate.job.yaml (pre-rollout schema migration)

### Community 77 - "Kubernetes Deployment Model (Docs)"
Cohesion: 0.67
Nodes (3): Kubernetes deployment model, platform-api, worker

### Community 78 - "Qdrant Collection Provisioning (Docs)"
Cohesion: 0.67
Nodes (3): QdrantCollectionProvisioner, schema control document (meta.objectId==='schema'), QdrantCollectionProvisioner (local testing reference)

### Community 79 - "Pipeline Config Dead Code (Docs)"
Cohesion: 0.67
Nodes (3): ChatPipelineConfig, IngestPipelineConfig, llm field on IngestPipelineConfig (dead code, fixed)

## Knowledge Gaps
- **478 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+473 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **57 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `bootstrap()` connect `Chat Interface/Bootstrap` to `Project Isolation Guard Tests`, `API Key Authentication Flow`, `Repo Document-Ingest Processors`, `Health Check / Infrastructure`, `Redis Rate Limiter`, `Create Project Flow`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `auditLogMiddleware()` connect `Project Isolation Guard Tests` to `Audit Log Domain`, `Pipeline Runs (DAP Events)`, `Chat Interface/Bootstrap`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _478 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Pipeline Builder Extension` be split into smaller, more focused modules?**
  _Cohesion score 0.06772151898734177 - nodes in this community are weakly interconnected._
- **Should `RocketRide VS Code Panels/API` be split into smaller, more focused modules?**
  _Cohesion score 0.07645875251509054 - nodes in this community are weakly interconnected._
- **Should `Worker App Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._
- **Should `Pipeline Runs (DAP Events)` be split into smaller, more focused modules?**
  _Cohesion score 0.1021021021021021 - nodes in this community are weakly interconnected._