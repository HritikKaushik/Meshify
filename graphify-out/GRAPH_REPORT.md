# Graph Report - .  (2026-07-14)

## Corpus Check
- 323 files · ~74,856 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1996 nodes · 3366 edges · 152 communities (105 shown, 47 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 52 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- RocketRide Client Pool & Logging
- BFF: Clerk Session & Proxy
- Worker Package Dependencies
- Document Storage & Entity
- Project Repository (Postgres)
- Web App Routing & Pages
- BFF Package Dependencies
- Chat Use Cases (Ask/Delete)
- Chat Entity & Repository
- Repository Connect/Delete Use Cases
- Root Workspace Tooling
- Platform-API Dependencies
- Reference Docs & Glossary
- API Keys: Entity & Hashing
- Repository Storage & Repo (Postgres)
- Web UI Primitives (Card/Table/Input)
- Worker: Ingest Processors
- Turbo Build Config
- Project Create/Delete Use Cases
- Sidebar, Command Palette & ProjectCard
- Web Shell Primitives
- RocketRide Gateway Deps
- Pipeline Job Entity & Repository
- MeshifyApi Client
- Data-Access Package Deps
- TypeScript Config (web)
- Web API Types
- Testing Package Config
- Documents & Evaluation Controllers
- Observability: DAP Events
- Health Checks & Dependency Probes
- shadcn components.json
- Chat Message Rendering
- Audit Log Entity & Repository
- Semantic Search Use Case
- Object-Storage Package (S3)
- Config Package (zod)
- Repo File Entity & Repository
- Clerk Org Link Entity & Repository
- Shared Package Devdeps
- Embedding Provider & Factory
- GitHub App Auth & Repo Client
- Queues Package (BullMQ)
- Shared Logger Package (pino)
- Package Devdeps
- Platform-API Runtime Deps
- Platform-API Devdeps
- Web Runtime Deps (React/Radix)
- Web Build Devdeps (Vite/Tailwind)
- Shell & Button/Dialog Primitives
- Pipeline Run Traces & Cost
- Shared tsconfig.base
- Health & Document List Controllers
- RAG Retrieval & Prompt Building
- CI/CD & Docker Compose Services
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 125
- Community 126
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151

## God Nodes (most connected - your core abstractions)
1. `cn()` - 50 edges
2. `MeshifyApi` - 28 edges
3. `useAsync()` - 19 edges
4. `compilerOptions` - 17 edges
5. `scripts` - 17 edges
6. `projectIsolationGuard()` - 16 edges
7. `buildIngestPipeline()` - 15 edges
8. `InMemoryChatRepository` - 14 edges
9. `compilerOptions` - 14 edges
10. `bootstrap()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `RocketRide (AI Pipeline Builder)` --semantically_similar_to--> `RocketRide (AI Pipeline Builder)`  [INFERRED] [semantically similar]
  .github/copilot-instructions.md → .claude/rules/rocketride.md
- `Project Isolation (per-tenant vector collections)` --semantically_similar_to--> `project_id + ON DELETE CASCADE isolation`  [INFERRED] [semantically similar]
  README.md → docs/architecture/data-model.md
- `platform-api service` --conceptually_related_to--> `meshify-platform-api image`  [INFERRED]
  infrastructure/docker/docker-compose.yml → .github/workflows/ci.yml
- `apps/platform-api (Core HTTP API)` --calls--> `@meshify/vector-store (Qdrant provisioning + search)`  [EXTRACTED]
  apps/platform-api/README.md → docs/architecture/overview.md
- `pnpm Workspace Config` --references--> `@meshify/config`  [INFERRED]
  pnpm-workspace.yaml → packages/config/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Mandatory RocketRide setup docs read before coding** — claude_rules_rocketride_readme, github_copilot_instructions_readme, docs_deadcodereport_check_ts, docs_developmentguide_rocketride_gateway [INFERRED 0.85]
- **The three deployable Meshify images built by CI and run via docker-compose** — infrastructure_docker_docker_compose_platform_api, infrastructure_docker_docker_compose_worker, infrastructure_docker_docker_compose_observability, github_workflows_ci_images_job [EXTRACTED 1.00]
- **Shared meshify-config/meshify-secrets across all core workloads** — infrastructure_kubernetes_base_migrate_job_meshifymigrate, infrastructure_kubernetes_base_platform_api_deployment_platformapi, infrastructure_kubernetes_base_worker_deployment_worker, infrastructure_kubernetes_base_observability_deployment_observability [INFERRED 0.95]
- **Dev overlay patch set (HPA, Deployment, ScaledObject, PDBs downsized/removed for low-footprint dev)** — infrastructure_kubernetes_overlays_dev_kustomization_dev, infrastructure_kubernetes_base_platform_api_hpa_platformapi, infrastructure_kubernetes_base_platform_api_deployment_platformapi, infrastructure_kubernetes_base_worker_keda_scaledobject_worker, infrastructure_kubernetes_base_pdb_platformapi, infrastructure_kubernetes_base_pdb_worker [EXTRACTED 1.00]
- **Chat RAG flow (retrieve → prompt → generate)** — docs_ai_rag_and_ingestion_chat_rag, docs_ai_rag_and_ingestion_direct_qdrant_retrieval, docs_ai_rag_and_ingestion_rocketride_gateway, docs_architecture_overview_embeddings [EXTRACTED 1.00]
- **Request auth chain (Clerk → org key → HMAC → isolation)** — docs_backend_auth_clerk_session, docs_backend_auth_org_api_key, docs_backend_auth_hmac_key_hash, docs_backend_auth_project_isolation_guard [EXTRACTED 1.00]
- **End-to-end request flow (web → bff → platform-api → worker)** — apps_web_readme_web, apps_bff_readme_bff, apps_platform_api_readme_platform_api, apps_worker_readme_worker [EXTRACTED 1.00]
- **Queue Producer/Consumer Contract** — packages_queues_readme, docs_reference_glossary_worker, docs_reference_glossary_platform_api, docs_reference_glossary_dlq [INFERRED 0.75]
- **RAG Retrieval Stack** — packages_embeddings_readme, packages_vector_store_readme, docs_reference_glossary_rag, docs_reference_glossary_collection [INFERRED 0.75]
- **Shared Testing Infrastructure** — packages_testing_readme, docs_testing_index, tests_readme, packages_testing_src_testcontainers_readme [EXTRACTED 0.85]

## Communities (152 total, 47 thin omitted)

### Community 0 - "RocketRide Client Pool & Logging"
Cohesion: 0.07
Nodes (46): bootstrap(), consoleLogger, main(), ClientPoolLogger, RocketRideClientPool, main(), OUT_DIR, qdrant() (+38 more)

### Community 1 - "BFF: Clerk Session & Proxy"
Cohesion: 0.06
Nodes (29): bootstrap(), requireBffEnv(), requireClerkSession(), Express, Request, resolveOrgForClerk(), ResolveOrgForClerkDeps, createHealthProxy() (+21 more)

### Community 2 - "Worker Package Dependencies"
Cohesion: 0.04
Nodes (48): adm-zip, dependencies, adm-zip, bullmq, ioredis, @meshify/config, @meshify/data-access, @meshify/github (+40 more)

### Community 3 - "Document Storage & Entity"
Cohesion: 0.07
Nodes (15): DocumentObjectStore, DocumentVectorStore, ALLOWED_MIME_TYPES, Document, DocumentSourceType, DocumentStatus, EXTENSION_TO_SOURCE_TYPE, sourceTypeFromFilename() (+7 more)

### Community 4 - "Project Repository (Postgres)"
Cohesion: 0.08
Nodes (12): PostgresProjectRepository, ProjectRow, toDomain(), Project, CreateProjectInput, ProjectRepository, QdrantCollectionProvisioner, Call (+4 more)

### Community 5 - "Web App Routing & Pages"
Cohesion: 0.05
Nodes (23): App(), ChatPage, DashboardPage, DocumentsPage, EvaluationPage, OrgShell, ProjectHomePage, RepositoriesPage (+15 more)

### Community 6 - "BFF Package Dependencies"
Cohesion: 0.05
Nodes (39): dependencies, @clerk/express, express, http-proxy-middleware, @meshify/config, @meshify/data-access, @meshify/shared, pg (+31 more)

### Community 7 - "Chat Use Cases (Ask/Delete)"
Cohesion: 0.10
Nodes (22): AskQuestionCommand, AskQuestionResult, AskQuestionUseCase, ChatNotFoundError, chat(), makeRepo(), DeleteConversationCommand, DeleteConversationUseCase (+14 more)

### Community 8 - "Chat Entity & Repository"
Cohesion: 0.12
Nodes (14): Chat, ChatSummary, Message, MessageCitation, MessageRole, ChatRepository, CreateChatInput, CreateMessageInput (+6 more)

### Community 9 - "Repository Connect/Delete Use Cases"
Cohesion: 0.08
Nodes (16): ConnectGitHubRepositoryCommand, ConnectGitHubRepositoryUseCase, ConnectRepositoryResult, DeleteRepositoryCommand, DeleteRepositoryUseCase, PROJECT, ListRepositoriesUseCase, RepositoryNotFoundError (+8 more)

### Community 10 - "Root Workspace Tooling"
Cohesion: 0.06
Nodes (33): devDependencies, @meshify/testing, turbo, vitest, @vitest/coverage-v8, @meshify/testing, turbo, vitest (+25 more)

### Community 11 - "Platform-API Dependencies"
Cohesion: 0.06
Nodes (32): dependencies, @meshify/config, @meshify/data-access, @meshify/rocketride-gateway, @meshify/shared, pg, devDependencies, tsx (+24 more)

### Community 12 - "Reference Docs & Glossary"
Cohesion: 0.08
Nodes (33): Troubleshooting Guide, Readiness Names Down Dependency, Environment Variables Reference, loadEnv Single Source of Truth, Engineering FAQ, BFF Keeps API Key Server-Side, Retrieval Outside RocketRide, Glossary (+25 more)

### Community 13 - "API Keys: Entity & Hashing"
Cohesion: 0.12
Nodes (17): ApiKey, AuthContext, generateApiKey(), hashApiKey(), hashesEqual(), looksLikeApiKey(), ActiveApiKey, ApiKeyRepository (+9 more)

### Community 14 - "Repository Storage & Repo (Postgres)"
Cohesion: 0.11
Nodes (11): RepositoryObjectStore, RepositoryVectorStore, PostgresRepositoryRepository, RepositoryRow, toDomain(), parseGitHubUrl(), Repository, RepositorySource (+3 more)

### Community 15 - "Web UI Primitives (Card/Table/Input)"
Cohesion: 0.13
Nodes (20): Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Table (+12 more)

### Community 16 - "Worker: Ingest Processors"
Cohesion: 0.15
Nodes (23): bootstrap(), DocumentIngestProcessorDeps, processDocumentIngestJob(), processRepoIngestJob(), RepoIngestProcessorDeps, toBatches(), toIngestFile(), processRepoSyncJob() (+15 more)

### Community 17 - "Turbo Build Config"
Cohesion: 0.08
Nodes (28): ^build, dist/**, package.json, tests/**, tsconfig.json, vitest.config.*, dependsOn, outputs (+20 more)

### Community 18 - "Project Create/Delete Use Cases"
Cohesion: 0.09
Nodes (14): CreateProjectCommand, CreateProjectUseCase, OrgNotFoundError, COMMAND, ProvisionerCall, DeleteProjectUseCase, ProjectNotFoundError, GetProjectStatsUseCase (+6 more)

### Community 19 - "Sidebar, Command Palette & ProjectCard"
Cohesion: 0.13
Nodes (23): CommandPalette(), Item, ConversationRow(), WorkspaceSidebar(), OverlayIcon(), ProjectCard(), Stat(), PALETTE (+15 more)

### Community 20 - "Web Shell Primitives"
Cohesion: 0.17
Nodes (20): Repository, DataRow(), RepoStatusBadge(), OrgShell(), BeamCard(), DOT_HEX, DotColor, GlassCard() (+12 more)

### Community 21 - "RocketRide Gateway Deps"
Cohesion: 0.07
Nodes (26): dependencies, @meshify/config, rocketride, devDependencies, tsx, @types/node, typescript, vitest (+18 more)

### Community 22 - "Pipeline Job Entity & Repository"
Cohesion: 0.14
Nodes (8): PipelineJob, PipelineJobStatus, PipelineJobType, CreatePipelineJobInput, PipelineJobRepository, PipelineJobRow, PostgresPipelineJobRepository, toDomain()

### Community 24 - "Data-Access Package Deps"
Cohesion: 0.08
Nodes (25): dependencies, @meshify/config, pg, devDependencies, tsx, @types/node, @types/pg, typescript (+17 more)

### Community 25 - "TypeScript Config (web)"
Cohesion: 0.08
Nodes (24): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module, moduleResolution (+16 more)

### Community 26 - "Web API Types"
Cohesion: 0.12
Nodes (19): ApiConfig, ApiError, ChatResponse, Conversation, DocumentSummary, EvaluationReport, GoldenCase, HealthReport (+11 more)

### Community 27 - "Testing Package Config"
Cohesion: 0.09
Nodes (21): dependencies, @meshify/data-access, description, devDependencies, typescript, vitest, exports, ./factories (+13 more)

### Community 28 - "Documents & Evaluation Controllers"
Cohesion: 0.17
Nodes (13): createDocumentsController(), toResponse(), upload, goldenCaseSchema, RunEvaluationDto, runEvaluationSchema, createEvaluationController(), GetProjectUseCase (+5 more)

### Community 29 - "Observability: DAP Events"
Cohesion: 0.18
Nodes (7): DapEvent, DapEventHandler, Logger, num(), projectId(), noopLogger, unixToDate()

### Community 30 - "Health Checks & Dependency Probes"
Cohesion: 0.19
Nodes (7): HealthReport, DependencyChecker, DependencyCheckResult, DependencyStatus, PostgresChecker, QdrantChecker, RedisChecker

### Community 31 - "shadcn components.json"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, registries, @aceternity (+10 more)

### Community 32 - "Chat Message Rendering"
Cohesion: 0.19
Nodes (13): ChatCitation, ChatMessage, confidenceLabel(), isCodeSource(), Turn, MeshMessage(), StreamingIndicator(), SuggestionChip() (+5 more)

### Community 33 - "Audit Log Entity & Repository"
Cohesion: 0.22
Nodes (11): AuditLogEntry, AuditLogRepository, PostgresAuditLogRepository, apiKeyEnvVarFor(), EMBEDDING_DIMENSIONS, embeddingDimensionFor(), embeddingProviderFromProfile(), llmProviderFromProfile() (+3 more)

### Community 34 - "Semantic Search Use Case"
Cohesion: 0.18
Nodes (11): SearchCommand, SearchResponse, SearchUseCase, fakeEmbeddings, PROJECT, hitToItem(), mergeAndRank(), RocketRideMeta (+3 more)

### Community 35 - "Object-Storage Package (S3)"
Cohesion: 0.11
Nodes (17): @aws-sdk/client-s3, dependencies, @aws-sdk/client-s3, devDependencies, @types/node, typescript, @types/node, typescript (+9 more)

### Community 36 - "Config Package (zod)"
Cohesion: 0.11
Nodes (17): dependencies, zod, devDependencies, @types/node, typescript, @types/node, typescript, zod (+9 more)

### Community 37 - "Repo File Entity & Repository"
Cohesion: 0.22
Nodes (7): FileStatus, RepoFile, FileRepository, UpsertFileInput, FileRow, PostgresFileRepository, toDomain()

### Community 38 - "Clerk Org Link Entity & Repository"
Cohesion: 0.24
Nodes (8): ClerkOrgLink, ClerkOrgLinkRepository, CreateClerkOrgLinkInput, ClerkOrgLinkRow, PostgresClerkOrgLinkRepository, decryptSecret(), deriveKey(), encryptSecret()

### Community 39 - "Shared Package Devdeps"
Cohesion: 0.11
Nodes (17): devDependencies, @types/node, typescript, vitest, @types/node, typescript, vitest, main (+9 more)

### Community 40 - "Embedding Provider & Factory"
Cohesion: 0.27
Nodes (8): EmbeddingProvider, MissingEmbeddingKeyError, UnsupportedEmbeddingProfileError, createEmbeddingProvider(), EmbeddingKeys, isOpenAiEmbeddingProfile(), OPENAI_EMBEDDING_PROFILES, OpenAiEmbeddingProvider

### Community 41 - "GitHub App Auth & Repo Client"
Cohesion: 0.21
Nodes (6): base64url(), GitHubAppAuth, GitHubAppConfig, ComparedFile, GitHubRepoClient, RepoHead

### Community 42 - "Queues Package (BullMQ)"
Cohesion: 0.11
Nodes (17): dependencies, bullmq, devDependencies, @types/node, typescript, bullmq, @types/node, typescript (+9 more)

### Community 43 - "Shared Logger Package (pino)"
Cohesion: 0.11
Nodes (17): dependencies, pino, devDependencies, @types/node, typescript, pino, @types/node, typescript (+9 more)

### Community 44 - "Package Devdeps"
Cohesion: 0.11
Nodes (17): devDependencies, @types/node, typescript, vitest, @types/node, typescript, vitest, main (+9 more)

### Community 45 - "Platform-API Runtime Deps"
Cohesion: 0.12
Nodes (17): dependencies, express, ioredis, @meshify/embeddings, @meshify/queues, @meshify/rocketride-gateway, @meshify/shared, pino (+9 more)

### Community 46 - "Platform-API Devdeps"
Cohesion: 0.12
Nodes (17): devDependencies, @meshify/testing, tsx, @types/express, @types/multer, @types/node, @types/pg, typescript (+9 more)

### Community 47 - "Web Runtime Deps (React/Radix)"
Cohesion: 0.12
Nodes (17): dependencies, @clerk/clerk-react, clsx, @radix-ui/react-dialog, @radix-ui/react-slot, react, sonner, tailwind-merge (+9 more)

### Community 48 - "Web Build Devdeps (Vite/Tailwind)"
Cohesion: 0.12
Nodes (17): devDependencies, autoprefixer, postcss, tailwindcss, @types/react, @types/react-dom, typescript, vite (+9 more)

### Community 49 - "Shell & Button/Dialog Primitives"
Cohesion: 0.30
Nodes (10): MeshLogo(), Button, ButtonProps, buttonVariants, DialogContent, DialogDescription, DialogFooter(), DialogHeader() (+2 more)

### Community 50 - "Pipeline Run Traces & Cost"
Cohesion: 0.22
Nodes (5): PipelineRunSnapshot, PipelineRunTraceInput, tokensToUsd(), PipelineRunRepository, PostgresPipelineRunRepository

### Community 51 - "Shared tsconfig.base"
Cohesion: 0.12
Nodes (15): compilerOptions, composite, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+7 more)

### Community 52 - "Health & Document List Controllers"
Cohesion: 0.23
Nodes (6): bootstrap(), ListDocumentsUseCase, CheckHealthUseCase, createHealthController(), GetJobStatusUseCase, createJobsController()

### Community 53 - "RAG Retrieval & Prompt Building"
Cohesion: 0.20
Nodes (6): fakeResolver, NO_CONTEXT, PROJECT, buildRagPrompt(), DEFAULT_INSTRUCTIONS, RetrievedChunk

### Community 54 - "CI/CD & Docker Compose Services"
Cohesion: 0.17
Nodes (15): @meshify/web dev console, docker-compose.yml (referenced from web README), RocketRide IDE extension (ships RocketRide server), images job (build & push), meshify-observability image, meshify-platform-api image, verify job (typecheck/build/test), meshify-worker image (+7 more)

### Community 55 - "Community 55"
Cohesion: 0.13
Nodes (14): devDependencies, @types/node, typescript, @types/node, typescript, main, name, private (+6 more)

### Community 56 - "Community 56"
Cohesion: 0.13
Nodes (14): description, devDependencies, @meshify/testing, vitest, @meshify/testing, vitest, name, private (+6 more)

### Community 57 - "Community 57"
Cohesion: 0.20
Nodes (3): ChatContextRetriever, ChatPipelineResolver, RocketRideChatPipelineResolver

### Community 58 - "Community 58"
Cohesion: 0.25
Nodes (8): EvaluationReport, RunEvaluationUseCase, CaseResult, CheckResult, evaluateAnswer(), EvaluatedAnswer, GoldenCase, includesCI()

### Community 59 - "Community 59"
Cohesion: 0.21
Nodes (7): ProjectStats, SectionHeading(), useOrg(), DashboardPage(), greeting(), read(), usePersistent()

### Community 60 - "Community 60"
Cohesion: 0.35
Nodes (8): buildChat(), buildChatSummary(), buildDocument(), buildMessage(), buildProject(), buildRepoFile(), buildRepository(), TEST_EPOCH

### Community 61 - "Community 61"
Cohesion: 0.28
Nodes (13): Job: meshify-migrate, packages/data-access/dist/migrate.js (schema migration runner), Deployment: observability (DAP event ingester, single replica), PodDisruptionBudget: platform-api, PodDisruptionBudget: worker, Deployment: platform-api, HorizontalPodAutoscaler: platform-api, Ingress: platform-api (+5 more)

### Community 62 - "Community 62"
Cohesion: 0.17
Nodes (11): compilerOptions, outDir, rootDir, exclude, extends, include, src, src/**/*.test.ts (+3 more)

### Community 63 - "Community 63"
Cohesion: 0.24
Nodes (11): apps/bff (Backend-for-frontend), apps/web (React + Vite SPA), Route code-splitting (React.lazy + Suspense), mc.* design token system, MeshifyApi client (centralized fetch), OrgShell / WorkspaceShell routing, Clerk Session authentication, HMAC-SHA256 key_hash with pepper (+3 more)

### Community 64 - "Community 64"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, src, src/**/*.test.ts (+2 more)

### Community 65 - "Community 65"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, src, src/**/*.test.ts (+2 more)

### Community 66 - "Community 66"
Cohesion: 0.38
Nodes (7): createDocumentIngestQueue(), DocumentIngestJobPayload, DEFAULT_JOB_OPTS, createRepoIngestQueue(), createRepoSyncQueue(), RepoIngestJobPayload, RepoSyncJobPayload

### Community 67 - "Community 67"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, src, src/**/*.test.ts (+2 more)

### Community 69 - "Community 69"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, declaration, noEmit, rootDir, sourceMap, extends, include (+2 more)

### Community 70 - "Community 70"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, preview, typecheck, type (+1 more)

### Community 71 - "Community 71"
Cohesion: 0.20
Nodes (9): compilerOptions, outDir, rootDir, exclude, extends, include, src, src/**/*.test.ts (+1 more)

### Community 72 - "Community 72"
Cohesion: 0.20
Nodes (9): compilerOptions, outDir, rootDir, exclude, extends, include, src, src/**/*.test.ts (+1 more)

### Community 73 - "Community 73"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json, references

### Community 74 - "Community 74"
Cohesion: 0.28
Nodes (9): apps/platform-api (Core HTTP API), apps/worker (BullMQ ingestion), @meshify/embeddings (provider-agnostic embedding), @meshify/github (GitHub App client), @meshify/object-storage (S3-compatible client), @meshify/queues (BullMQ queue definitions), BullMQ Queues (document-ingest, repo-ingest, repo-sync), Graceful shutdown (drain in-flight jobs) (+1 more)

### Community 76 - "Community 76"
Cohesion: 0.28
Nodes (3): VectorSearchContextRetriever, EmbeddingProviderFactory, ConfiguredEmbeddingProviderFactory

### Community 77 - "Community 77"
Cohesion: 0.28
Nodes (4): DeleteDocumentCommand, DeleteDocumentUseCase, DocumentNotFoundError, PROJECT

### Community 78 - "Community 78"
Cohesion: 0.22
Nodes (9): Chat (retrieval-augmented generation flow), Direct Qdrant retrieval (bypasses RocketRide), RocketRide SDK only in gateway rule, Pipeline token self-heal retry, @meshify/rocketride-gateway (AI gateway boundary), Raw SQL only in data-access rule, @meshify/config (zod env schema), @meshify/data-access (Postgres repos + migrations) (+1 more)

### Community 79 - "Community 79"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json, references

### Community 82 - "Community 82"
Cohesion: 0.32
Nodes (3): api, EvaluationPanel(), SearchPanel()

### Community 83 - "Community 83"
Cohesion: 0.25
Nodes (8): Document Ingestion flow, PipelineRegistry (pipeline reuse via useExisting), Repository Ingestion flow, project_id + ON DELETE CASCADE isolation, Per-project Qdrant collections (_documents, _code), @meshify/vector-store (Qdrant provisioning + search), projectIsolationGuard (404 on cross-org), Project Isolation (per-tenant vector collections)

### Community 84 - "Community 84"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 85 - "Community 85"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 86 - "Community 86"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 87 - "Community 87"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 88 - "Community 88"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 89 - "Community 89"
Cohesion: 0.32
Nodes (4): Assertion, AsymmetricMatchersContaining, CustomMatchers, vitest

### Community 91 - "Community 91"
Cohesion: 0.29
Nodes (7): apps/observability (pipeline traces), Postgres schema (system of record), Job idempotency (jobId pinned to pipeline_jobs id), pipeline_jobs durable DLQ mirror, Retry with exponential backoff (5 attempts), Meshify Platform, pnpm + Turborepo Monorepo

### Community 92 - "Community 92"
Cohesion: 0.33
Nodes (3): UploadDocumentCommand, UploadDocumentResult, UploadDocumentUseCase

### Community 93 - "Community 93"
Cohesion: 0.29
Nodes (3): NO_CONTEXT, PROJECT, resolver

### Community 94 - "Community 94"
Cohesion: 0.33
Nodes (7): Documentation template (_TEMPLATE.md), Clean Architecture (Domain ← Application ← Infrastructure ← Interface), Composition Root (main.ts dependency injection), Repository Port pattern, Use Case (business rules layer), Living Documentation principle, Meshify Engineering Handbook

### Community 95 - "Community 95"
Cohesion: 0.29
Nodes (7): Forward-only SQL migrations, Turbo CI/CD pipeline, Colocated unit tests convention, @meshify/testing (shared test infra), @meshify/root-tests (repository-wide suites), Turbo cached + affected-only test orchestration, Vitest single-framework test stack

### Community 97 - "Community 97"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, typecheck

### Community 98 - "Community 98"
Cohesion: 0.53
Nodes (4): Env, envSchema, loadEnv(), resetEnvCache()

### Community 99 - "Community 99"
Cohesion: 0.53
Nodes (5): engineListenPorts(), ENV_PATH, main(), probe(), sh()

### Community 100 - "Community 100"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 101 - "Community 101"
Cohesion: 0.50
Nodes (5): Blue-to-Indigo Brand Gradient, Meshify Favicon / Brand Mark, Stylized 'M' Monogram, Mesh Network Node-and-Edge Motif, Rounded-Square App Icon Tile

### Community 102 - "Community 102"
Cohesion: 0.60
Nodes (4): appliedMigrations(), ensureMigrationsTable(), main(), MIGRATIONS_DIR

### Community 103 - "Community 103"
Cohesion: 0.70
Nodes (3): createLogger(), Logger, LoggerOptions

### Community 104 - "Community 104"
Cohesion: 0.60
Nodes (5): chat.pipe (RAG chat template), ingest.pipe (document/code ingestion template), Multi-tenant pipeline generation (per-project pipeline + Qdrant collections), packages/rocketride-gateway/src/pipeline-builder (runtime pipeline builders), RocketRide VS Code extension (pipeline inspection/debugging workflow)

### Community 106 - "Community 106"
Cohesion: 0.50
Nodes (4): kubernetes/base (namespaced workloads), HPA (platform-api CPU autoscaling), KEDA (worker queue-depth autoscaling), migrate.job.yaml (pre-rollout schema migration)

### Community 108 - "Community 108"
Cohesion: 1.00
Nodes (3): DLQ (Dead-Letter Queue), Worker (BullMQ Consumer), @meshify/queues

### Community 109 - "Community 109"
Cohesion: 0.67
Nodes (3): qdrant service, meshify-config ConfigMap, kustomization.yaml resources list

## Knowledge Gaps
- **600 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+595 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **47 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `bootstrap()` connect `Health & Document List Controllers` to `RocketRide Client Pool & Logging`, `BFF: Clerk Session & Proxy`, `Chat Use Cases (Ask/Delete)`, `Repository Connect/Delete Use Cases`, `Project Create/Delete Use Cases`, `Documents & Evaluation Controllers`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `auditLogMiddleware()` connect `BFF: Clerk Session & Proxy` to `Audit Log Entity & Repository`, `Health & Document List Controllers`, `Observability: DAP Events`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `bootstrap()` connect `Worker: Ingest Processors` to `RocketRide Client Pool & Logging`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _600 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `RocketRide Client Pool & Logging` be split into smaller, more focused modules?**
  _Cohesion score 0.06867088607594937 - nodes in this community are weakly interconnected._
- **Should `BFF: Clerk Session & Proxy` be split into smaller, more focused modules?**
  _Cohesion score 0.05786090005844535 - nodes in this community are weakly interconnected._
- **Should `Worker Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._