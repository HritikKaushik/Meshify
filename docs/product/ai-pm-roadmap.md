---
title: AI Project Management Roadmap
purpose: How Meshify evolves from a RAG knowledge tool into an AI project-management platform - identity and RBAC first, then per-project persistent memory, then PM capabilities.
audience: Engineering, product, and anyone planning the next releases.
owner: Platform Team
status: draft
last_updated: 2026-09-19
prerequisites:
  - architecture/overview.md
  - ai/rag-and-ingestion.md
  - backend/auth.md
related:
  - architecture/data-model.md
  - backend/connector-engine.md
  - backend/ai-providers.md
---

# Meshify: from RAG tool to AI project-management platform

> Meshify today answers questions about a project's code, documents and Slack
> with citations. This document is the approved path to a product that also
> knows who is asking, what they are allowed to do, and what the project has
> decided, risked and committed to - written against the code as it exists on
> `development` and the RocketRide engine as its source actually behaves.

## Context

Meshify today is a multi-tenant AI knowledge workspace: Clerk sign-in, projects, ingestion of documents / GitHub repos / Slack into per-project Qdrant collections through RocketRide pipelines, and grounded chat with citations and a confidence meter. It has no people, no roles, no memory, no work items.

Goal (three tracks, in this order):

1. **Identity + RBAC** - real users, org roles, per-project roles (PMO, Developer, BA, Viewer), capability checks.
2. **Per-project persistent memory** - structured, queryable, auditable memory, with RocketRide as the engine that writes and reads it.
3. **AI project-management roadmap** - native work items + two-way sync with external trackers, digests, risk detection, agents.

### Decisions confirmed with the product owner (2026-09-19)

| Topic | Decision |
|---|---|
| Memory system of record | Postgres (structured) + a 3rd per-project Qdrant `memory` collection. RocketRide runs extraction pipelines (write) and the chat pipeline (read). `memory_persistent` is NOT used. |
| Prior branch (`a5e1417`, `40b7c80`) | Start clean; reuse ideas only (proposed/confirmed/superseded lifecycle, `due_date::text` timezone fix, persisted confidence). |
| RBAC model | Meshify-owned in Postgres. Clerk = authentication only. Org role (owner/admin/member) + per-project role. Capability-based checks. |
| Project roles in release 1 | PMO, Developer, BA, Viewer - all four. |
| Memory trust | Extracted items land as `proposed`, usable in chat with an "unconfirmed" label; a person with `memory:confirm` (or corroboration) promotes to `confirmed`. |
| Data visibility | Roles gate actions only for now; memory rows and sources carry a `visibility` field from day one. |
| Sequencing | Identity + RBAC first, then memory. |
| PM direction | Hybrid: native `work_items` + structured ingestion / two-way sync with GitHub Issues, Jira, Linear. |

## Audit summary (what exists today)

**Product surface.** Vite 6 + React 18 SPA (`apps/web`), react-router 7, Tailwind + shadcn, hand-rolled `useAsync`, single wire client `apps/web/src/api.ts`. Screens: Project Home, Chat, Repositories, Documents, Slack, Integrations (+ AI Models, BYOA), Settings (read-only + delete), SSE Job Progress Center. Missing: members/roles UI, client-side gating (the browser never learns the role), project edit, work items, notifications (both bells are decorative), audit viewer, search, memory, e2e tests, chat streaming.

**Backend.** Express 4, Clean Architecture modules (`apps/platform-api/src/modules/<domain>/{domain,application,infrastructure,interface}`), composition root `apps/platform-api/src/main.ts`, mandatory `createRouter()`, zod in controllers, typed errors, 404-not-403 across tenants. Raw SQL over `pg`; forward-only migrations `packages/data-access/migrations/0001..0018`; 3-file aggregate pattern + barrel + `InMemory*Repository` in `packages/testing`. Tenancy = `where org_id = $1` + `projectIsolationGuard`. No RLS.

**Auth today.** Clerk cookie -> BFF -> shared org API key + trusted headers -> platform-api `AuthContext { orgId, keyId, scopes, actorId?, isOrgAdmin }`. Verified defects:
- `toMeshifyRole` (`apps/bff/src/modules/auth/resolve-org-for-clerk.ts:22-24`) collapses every Clerk role except `org:admin` to `member`.
- `authenticate.usecase.ts:60`: no role header = admin.
- 12 `requireOrgAdmin`/`requireLlmAdmin` call sites; every other mutation is unguarded; `requireScope` has zero call sites.
- No person exists in Postgres: `users` is dead (global-unique email, zero reads/writes), `chats.user_id` / `audit_logs.actor_id` always NULL, `actorId` is only a rate-limit key.
- No project membership: any org member can do anything in every project. Leaks: `GET /v1/jobs/:jobId`, `connectedProjectIds` in `GET /v1/integrations`, body `projectId` on integrations connect and LLM activate, org-wide SSE.

**AI / RAG.** Two RocketRide pipeline shapes built in code per project (`packages/rocketride-gateway/src/pipeline-builder/`): ingest (`webhook -> parse -> preprocessor_langchain -> embedding_openai -> qdrant`) and chat (`chat -> llm -> response_answers`, a bare LLM call). Retrieval, prompt, citations, confidence are Meshify code (`apps/platform-api/src/modules/chat`, `.../retrieval`). `PipelineRegistry` serializes all lifecycle ops over one DAP connection. `packages/ai` has no completion API and no structured-output helper; `LlmResolutionService` lives in platform-api so the worker cannot resolve an org's LLM. Ingestion is file contents only (no GitHub issues/PRs/commits; Slack flattened to conversation docs; `KnowledgeItem.metadata` dropped in `apps/worker/src/processors/knowledge-writer.ts`). History = last 10 raw messages; nothing crosses conversations; `confidence`/`model_used`/`tokens_used` never persisted. No summarization, extraction, digests, work items, or memory of any kind.

**RocketRide memory components (read from engine source).** `memory_internal` = run-scoped agent scratchpad. `memory_persistent` = experimental Redis KV keyed by `metadata.session_id`; stores only `last_answer` + `answer_count`; attaches `metadata.memory_context` that no engine node reads; "auto-summarize" compacts an op log, not content; Redis host/port/password only (no TLS - blocker for the cloud engine); TS SDK `Question` cannot set `session_id`. `tool_mem0`/`tool_xtrace_memory` = third-party SaaS. Hence the Postgres + Qdrant decision. RocketRide's real value here: extraction/summarization pipelines, `Question.addContext/addHistory/addInstruction` + `expectJson`, and later `agent_rocketride` + tools.

---

## Phase 1 - Identity + RBAC

Deploy-order constraint (`.github/workflows/deploy.yml`): platform-api deploys first and runs migrations; BFF/web/worker follow. Every migration must work with the previous release's code, and new platform-api must tolerate the old BFF for a few minutes.

### 1.1 Data model - migration `0019_identity.sql`

- **`users`**: assert the dead table is empty, drop its two FKs, drop it (no CASCADE), recreate as a global identity table: `id uuid pk`, `clerk_user_id text unique` (only upsert key), `email` (display only, NOT unique), `display_name`, `avatar_url`, `last_seen_at`, `deactivated_at`, timestamps. Re-point `chats.user_id` and `audit_logs.actor_id` at it with `on delete set null` (today `chats.user_id` cascades - wrong for shared conversations). Old code keeps inserting NULL, so the deploy window is safe.
- **`org_memberships`**: `(org_id, user_id)` unique, `role_key check in (owner, admin, member)`, `status check in (active, suspended, removed)`, `clerk_membership_id`. "At least one owner" enforced in the repository transaction with `select ... for update` on the org row.
- **`project_memberships`**: `(project_id, user_id)` unique, `role_key text` (format-checked, not enum-checked, so custom roles need no migration), `added_by_user_id`. Composite FKs `(project_id, org_id) -> projects` and `(org_id, user_id) -> org_memberships` make cross-org membership impossible at the DB level (requires `unique (id, org_id)` on `projects`).
- **Legacy-project safety valve**: `projects.default_member_role_key text` + `projects.created_by_user_id`. Non-null default role = every active org member without an explicit row gets that role implicitly. Existing projects are set to `developer` (stay open, nobody locked out); new projects default to NULL (private). Reversible, and independent of who has signed in before cutover.
- **`api_keys.kind`** `check in (service, bff)` (+ `created_by_user_id`); backfill `bff` for keys referenced by `clerk_org_links`.
- **Attribution columns** (nullable, `on delete set null`, no backfill): `messages.author_user_id`, `documents.uploaded_by_user_id`, `repositories.connected_by_user_id`, `knowledge_connectors.created_by_user_id`, `integrations.connected_by_user_id`, `oauth_states.created_by_user_id`, `pipeline_jobs.triggered_by_user_id`. Also `messages.confidence real check (0..1)`.
- **`audit_logs`**: add `actor_type check in (user, service, system)`, `category check in (http, domain)`, indexes `(org_id, created_at desc)`, `(actor_id)`.

Roles and permissions are a **code-defined catalog** (a permission without a code check is meaningless; versioned, reviewable, snapshot-testable, no drift). Path to org-defined custom roles later: `org_roles` table + nullable `custom_role_id` on memberships; all lookups already go through one `RoleResolver.resolve(orgId, roleRef)`. Unknown `role_key` -> empty permission set + error log.

### 1.2 Syncing Clerk into Postgres

- **JIT in the BFF**: `resolveOrgForClerk` becomes `resolveIdentityForClerk`, calling new `packages/data-access/src/identity/sync-clerk-member.ts` (manual transaction, same style as `provision-org-for-clerk.ts`, `Queryable` seam). Bounded LRU (5 min) keyed `clerkOrgId:clerkUserId`. Role seed on first membership: no active owner and caller is Clerk `org:admin`/creator -> `owner`; else Clerk `org:admin` -> `admin`; else `member`. After creation the Meshify role is authoritative. A `removed` membership reactivates only after confirming with the Clerk membership API.
- **Clerk webhooks**: BFF `POST /api/webhooks/clerk`, mounted before CSRF + `clerkMiddleware`, `express.raw`, verified with `@clerk/express/webhooks` `verifyWebhook` (already installed, no svix dep). Handles `user.updated`, `user.deleted` (deactivate + scrub PII), `organizationMembership.created/deleted` (removal deletes project memberships in the same transaction).
- **Reconcile**: BFF interval job under a Postgres advisory lock (daily + boot) repairs drift; `scripts/backfill-identity.ts` runs the same code once before cutover so the Members UI is complete on day one.

### 1.3 Trust boundary BFF -> platform-api

- BFF forwards **identity only**; platform-api resolves authority from Postgres on every request.
- Replace the unsigned headers with an HMAC-signed assertion `x-meshify-actor: v1.<payload>.<hmac-sha256>`, payload `{ sub: users.id, org, iat, exp=iat+60s }`, secret `BFF_ASSERTION_SECRET` (`packages/config/src/env.ts`, added to the production strong-secret check, `generateValue` in the `render.yaml` env group). Codec in `packages/shared/src/actor-assertion.ts`. HMAC, not JWT: verifier = protected party, no new dependency. Add the header to `TRUSTED_HEADERS` (`apps/bff/src/modules/proxy/platform-proxy.ts:10`) so the webhook proxy strips it.
- **Principals** (fixes "no header = admin"): `kind='bff'` key + valid assertion -> user principal (authority only from memberships); `bff` key without assertion -> 401 once `IDENTITY_ASSERTION_MODE=required`; `kind='service'` key -> service principal, assertion header never read, authority = scopes expanded to permissions. Scope grammar: exact permission, `<resource>:*`, `*`; legacy `admin` = `*`; **empty scopes = no permissions** (migration converts existing service keys' `{}` to `{admin}` first).

### 1.4 Permission catalog - new zero-dependency package `packages/authz`

`permissions.ts` (`PERMISSIONS` const with `{ scope: 'org'|'project', tier }`), `roles.ts`, `resolve.ts`, `scopes.ts`. Effective project permissions = org role permissions + project role permissions (explicit row, else the project's default role). Visibility = effective `project:read`. Owner/admin hold every project permission, so "admins see all projects" falls out of the matrix with no special case.

Org roles: **owner** = everything; **admin** = everything except `org:delete`, `members:manage_owners`, `billing:manage`; **member** = `org:read`, `members:read`, `roles:read`, `projects:create`, `integrations:read`, `llm_providers:read`.

| Project permission | PMO | Developer | BA | Viewer |
|---|---|---|---|---|
| `project:read`, `documents:read`, `repositories:read`, `connectors:read`, `jobs:read`, `chat:read`, `chat:write`, `memory:read`, `workitems:read`, `digests:read`, `project_members:read` | x | x | x | x |
| `project:update`, `project:delete`, `project_members:manage`, `connectors:manage`, `repositories:delete`, `chat:manage`, `memory:delete`, `workitems:delete`, `digests:configure` | x | | | |
| `documents:write`, `memory:propose` (manual add / "remember this", lands `proposed`), `workitems:write` | x | x | x | |
| `documents:delete`, `memory:write` (edit, pin), `memory:confirm` (confirm / reject / supersede; their manual adds land `confirmed`), `memory:export`, `workitems:assign`, `digests:generate` | x | | x | |
| `memory:admin` (settings, budgets, run/dry-run extraction, forget/erase) | x | | | |
| `repositories:write`, `repositories:sync` | x | x | | |
| `connectors:sync` | x | x | x | |

Each cell is one line in `roles.ts`. A `qa` role is a one-entry addition later.

### 1.5 Enforcement in platform-api

- `AuthContext` moves to `apps/platform-api/src/modules/security/domain/auth-context.ts`: `{ orgId, keyId, principal: User | Service, orgPermissions }`; `req.projectAccess: { projectId, role, source: explicit|project_default|org_role|service_key, permissions }`.
- One primitive `authorize(permission): RequestHandler`, built once in `main.ts` via `createAuthorizer({ getProject, access })`. Project-scoped permissions compose the unchanged `projectIsolationGuard` + new `projectAccessGuard` + the check. Must run before multer. Imperative `access.requireProject(auth, projectId, perm)` for body `projectId` and `jobs/:jobId`.
- Semantics: no effective `project:read` -> 404 byte-identical to a nonexistent project; visible but lacking permission -> 403 `{ error, code: 'forbidden', permission }`; no active org membership -> 403 `not_a_member`.
- Listing: `ProjectRepository.findVisibleTo(orgId, userId, seesAll)`; project DTO gains `access`; filter `connectedProjectIds`.
- No cross-request cache (two indexed queries, memoized on `req`; revocation is immediate).
- SSE: extract `src/http/sse.ts`, re-resolve access every 60 s, emit `event: revoked` and end; web `JobsProvider` stops reconnecting on it.
- **Route coverage guard** (three layers): `createRouter()` throws at registration unless a handler is tagged by `authorize(...)`, `publicRoute(reason)` or `authenticatedOnly(reason)`; snapshot test `route-permissions.manifest.test.ts`; ESLint `no-restricted-imports` forbidding `Router` from `express` outside `http/router.ts`.
- **Shadow mode**: `RBAC_ENFORCEMENT=shadow|enforce`; shadow computes decisions, counts `meshify_rbac_shadow_denials_total{permission,route}`, then falls through to legacy checks. Temporary flag.

### 1.6 API + audit

New module `apps/platform-api/src/modules/identity/`. `GET /v1/me`, `GET /v1/roles`, `GET /v1/org/members`, `PATCH /v1/org/members/:userId` (last-owner demotion -> 409), `GET|PUT|DELETE /v1/projects/:projectId/members[/:userId]`, `PATCH /v1/projects/:projectId` (`name`, `description`, `defaultMemberRole`). Later: invitations via an `OrgDirectoryPort` (Clerk adapter), `GET /v1/org/audit-logs`.

Audit: middleware fills `actor_type`/`actor_id`; domain events (`org_member.role_changed`, `project_member.added|role_changed|removed`, `project.default_role_changed`) written in the **same transaction** as the change - `PostgresAuditLogRepository` takes `Queryable`, new `packages/data-access/src/db/transaction.ts` (`withTransaction`). `CreateProjectUseCase` inserts project + creator's PMO row atomically.

### 1.7 Web

`apps/web` depends on `@meshify/authz` (edit `apps/web/Dockerfile` to copy/build it; add `packages/authz/**` to web's `buildFilter` in `render.yaml`). `src/lib/me-context.tsx` (`MeProvider`, keyed on Clerk org id), `useCan(permission)` + `<Can>`, 403 toast naming the permission. `OrgShell` gains header tabs `Projects | Members` (+ `Audit` later) and mounts `<OrganizationSwitcher>`; routes `/org/members`, `/org/audit` in `App.tsx`. Project Members card + "Open to organization as ..." control in `SettingsPage.tsx`; project rename/edit. Gate `SECTIONS` and every destructive button. Non-members: `/home` shows only visible projects with an empty state naming org admins; hidden deep links show "Not found or no access".

### 1.8 Milestones (each independently deployable, no lockout)

| # | Milestone | Content |
|---|---|---|
| M1 | Identity foundation (no behaviour change) | 0019 + repositories + in-memory mocks + `buildAuthContext()` test helper; assertion codec; BFF JIT sync sends assertion AND legacy headers; platform-api `permissive`; `/v1/me`; attribution writes; persisted `messages.confidence`; `isOrgAdmin` derived from the Meshify org role. |
| M2 | Authorization core in shadow | `packages/authz`; `authorize` on every route; strict `createRouter`; manifest test; shadow metrics. |
| M3 | Membership management | Endpoints + domain audit; creator becomes PMO; web permissions context, Members UI, project edit. Ships before enforcement so admins can prepare. |
| M5 | Lifecycle sync | Clerk webhooks, reconcile job, backfill script. Ship before M4. |
| M4 | Cutover | Migration: re-run `kind` backfill, service keys `{}` -> `{admin}`, orphan-project safety net. Flip `IDENTITY_ASSERTION_MODE=required`, `RBAC_ENFORCEMENT=enforce`; SSE re-auth; list filtering. Gate: shadow-denial metric at zero for legitimate traffic. |
| M4b | Contract cleanup | Delete the role header, `isOrgAdmin`, `requireOrgAdmin`, `requireLlmAdmin`, `hasScope`, `requireScope`, both flags; update `docs/backend/auth.md` and the stale RBAC rows in `docs/operations/PRODUCTION_DEPLOYMENT_AUDIT.md`. |
| M6/M7 | Invitations + Clerk outbound mirror; audit viewer | Optional, after memory MVP. |

Risks: the 0019 emptiness assertion could fail a deploy (run the check query against prod first); owner-election race (org-row lock + concurrent-sync integration test); `BFF_ASSERTION_SECRET` missing on one service (permissive tolerates, `required` boot check catches); Clerk `org:admin` demoted in Meshify can still invite through Clerk until M6.

---

## Phase 2 - Per-project persistent memory

Facts learned while designing (all verified in source):
- RocketRide `extract_data` and `summarization` nodes are unsuitable: fixed generic prompts, no schema/enums/evidence, `extract_data` re-sends a cumulative table (quadratic tokens, unverifiable rewrites), `summarization` silently truncates. **The reliable shape is the bare `chat -> llm -> response_answers` pipeline driven with `new Question({ expectJson: true })`**: the engine strips fences/`<think>`, retries JSON syntax 3x, returns a parsed object. Schema validity is Meshify's job (zod + one repair round).
- SDK bug: `Question.addContext(object)` sends `"[object Object]"` (rocketride@1.3.0). Always pass pre-serialized strings.
- The LLM node swallows failures and returns a normal answer starting `**LLM error**`. Extraction must treat any non-object answer as failure (chat persists these as assistant messages today - fix in M0).
- `PipelineRegistry.reconcile()` always `restart`s an existing task even when the definition is identical, so two processes sharing one GUID kill each other's task. The memory pipeline gets its own GUID owned by exactly one service (the worker), and M0 skips `restart` when `getTaskPipeline(existing)` deep-equals the desired definition.
- After a sync, the only copy of source text (Slack, code, parsed PDF) is the Qdrant chunk payloads (`content`, `meta.parent`, `meta.chunkId`; engine uses `chunk_overlap = 0`, so ordered chunks reassemble cleanly). Extraction reads text back from Qdrant - no second parse, and no file ingestion through RocketRide's binary pipe (open corruption bug noted in `rag.service.ts:88-98`).

### 2.1 Data model

One `memory_items` table with a `kind` discriminator for facts (`decision`, `risk`, `commitment`, `constraint`, `requirement`, `assumption`, `open_question`) - same epistemic lifecycle, shape, read path, embedding. **`work_items` is a separate table** (workflow state machine orthogonal to trust, external identity + sync, hierarchy, far higher write volume, different trust semantics: a GitHub Issue is confirmed by construction).

- **`memory_items`**: `project_id`, `kind`, `statement` (8..500), `detail`, `status` proposed|confirmed|rejected|superseded (the trust boundary), `resolution` open|resolved|obsolete, `origin` extracted|manual|imported, `confidence`, `importance`, `pinned`, `owner_text` + `owner_user_id -> users`, `due_on date` (ALWAYS selected as `due_on::text` through an explicit `MEMORY_ITEM_COLUMNS` list; a unit test forbids `select *`/`returning *` - node-postgres shifts `date` by timezone), `severity`, `attributes jsonb` (zod per kind), `occurred_at`/`valid_from`/`valid_to`, `superseded_by`, `proposes_change_to` + `change_relation`, `evidence_state` supported|stale|unsupported|none, `corroboration_count`, `review_after`, `dedupe_key` (sha256 of kind + normalized statement; partial unique per project, covers rejected rows = negative memory), `human_edited_at`, `created_by/confirmed_by/rejected_by_user_id -> users` + `actor_label`, `extraction_run_id`, `visibility text not null default 'project'` (schema-ready per decision), `embedding_state` pending|synced|pending_delete|failed (transactional outbox), `search_tsv` generated tsvector, `version` (optimistic concurrency via `If-Match`), soft delete. Partial indexes for review queue, unowned-open, due, pinned-confirmed, embed-pending.
- **`memory_evidence`**: every row points at its proof - `source_kind`, `connector_id`, `source_ref` (= Qdrant `meta.parent`), `source_content_hash`, `chunk_ids`, `point_ids`, `locator jsonb`, `permalink` (from Meshify tables, NEVER from LLM output), `quote` (verbatim, verified substring), `observed_at`, `extraction_run_id`, `state` active|stale|purged, purge bookkeeping. Exclusive arc to `memory_items` / `work_items`.
- **`memory_events`**: append-only (trigger rejects DELETE and non-redaction UPDATE), `(subject_type, subject_id)` without FK so it outlives the subject, `before`/`after` jsonb, actor, `reverts_event_id`. Every mutation + its event in one transaction (`withTransaction`). Powers history + undo.
- M3 tables: `memory_extraction_runs` (model, prompt/extractor version, pipeline GUID, token estimates, `dry_run` + `result`), `memory_ledger` (pk `(project_id, source_ref)`, content hash + extractor version), `memory_extraction_backlog` (durable outbox; latest hash wins), `project_memory_settings` (enabled, auto_extract, sources, daily/monthly token budgets, `orphan_policy`, `paused_until/reason`), `memory_usage_daily`.
- M4: `chat_summaries`, `project_briefs` (versioned). M5: `work_items`. M6: `project_digests`.

Lifecycle rules: proposed -> confirmed|rejected; confirmed -> superseded; nothing else. Machines may update in place only when `status='proposed' and human_edited_at is null`; anything touching trusted memory becomes a new `proposed` row with `proposes_change_to` (confirming it supersedes the original). When all evidence is purged: proposed machine-only rows are hard-deleted; confirmed/edited rows become `unsupported`, leave always-on context and enter review (or are deleted under `orphan_policy='delete'`); explicit `erase` hard-deletes and redacts event snapshots.

### 2.2 Write path (RocketRide as the brain)

- **Pipeline**: new builder `packages/rocketride-gateway/src/pipeline-builder/memory-pipeline.ts` (`chat_1 -> llm_1 -> response_answers_1`, vendor-blind `llmNode`), `PipelineRegistry.ensureMemoryPipeline` (cache key `memory:<guid>`), new column `projects.rocketride_memory_pipeline_id` (0002 pattern) + `projects.qdrant_collection_memory`; added to `check.ts` and `export-pipelines.ts` -> `pipelines/memory.pipe`. Only the worker ever ensures this GUID; API features needing the LLM enqueue jobs. Bonus: `pipeline_runs.project_id` is the pipeline GUID, so exact memory token cost per project comes free.
- **Gateway port** `StructuredLlmPort.askJson(token, { role, instructions, examples, context: string[], task })` -> `{ ok, json } | { ok:false, reason: engine_llm_error|not_json|empty }` (`structured-llm.port.ts`, `.service.ts`, fake).
- **LLM resolution moves** to new `packages/llm-resolution` (`LlmResolutionService`, `buildEffectiveCredentials`, managed fallback, change channel + a subscriber) behind a structural `LlmCredentialReader` port; platform-api re-imports unchanged; the worker subscribes to `meshify:llm-provider-changes`.
- **Capture**: optional `KnowledgeChangeObserver { onUpserted, onRemoved }` on `ConnectorEngine` (called after `writer.embed` succeeds, before `ledger.setHashes`; metadata still present); documents lane upserts after `updateStatus('embedded')`. Observer failures never fail a sync. Hourly `memory-reconcile` maintenance task (in `MAINTENANCE_SCHEDULES`) is the completeness backstop and the backfill/version-bump mechanism.
- **Queue**: one `memory-extract` BullMQ queue; a job = "drain this project's backlog"; `createDeduped` key `memory_extract:<projectId>`; `withExecutionLock('memory:<projectId>')` makes all memory writes for a project strictly serial (consolidation has no races); `runPipelineJob` + `JobProgress` (job types `memory_extract`, `memory_digest`); 90 s debounce for sync reasons.
- **Drain loop** per backlog row: eligibility policy (Slack conversations, uploaded docs, repo `*.md`/`docs/**`/ADRs on; other code off in phase 1) -> ledger hash/version skip -> `QdrantSourceTextReader` scroll by `meta.parent` ordered by `meta.chunkId` -> chunk-aligned windows (~12k chars, fits the 16384 budget) -> extract -> validate -> consolidate -> one transaction per source item -> stamp ledger; evidence from an older hash not re-affirmed becomes `stale`.
- **Validation ladder**: engine JSON retries -> strict zod (top-level object `{ items: [...] }`, max 12) with element-wise salvage -> one repair call carrying zod issues -> else write nothing, ledger `failed`, `quarantined` after 3.
- **Deterministic guards**: quote must be a whitespace-normalized substring of the window (pins chunk ids deterministically; failed quote drops the item); `due_on` sanity window; deny URLs/markdown links/reader-directed imperatives; confidence computed from certainty bucket + corroboration, never the model's self-report.
- **Prompt-injection hardening**: source text only in `addContext` inside per-call random-nonce delimiters; sanitizer neutralizes lines starting `###` (RocketRide's own section marker) and the nonce; task rendered last; extraction pipeline has no tools; permalinks/ids never come from the model; only confirmed memory is always-on in chat, so an attacker cannot reach every prompt without a human confirming.
- **Consolidation**: exact `dedupe_key` hit -> add evidence + corroboration (rejected hit -> no-op). Else embed + search same-kind neighbours: < 0.80 ADD, >= 0.95 duplicate, in between one LLM judge call (`duplicate_of|updates|contradicts|distinct`, neighbours aliased `n1..n5`). The judge can never delete, confirm, or touch rejected rows; failures fall open to human review. Auto-confirm by corroboration stays off (later org opt-in).
- **Embedding**: Meshify embeds and upserts itself (point id = item id; payload `{subject_type, kind, status, resolution, evidence_state, valid, visibility}`), via new `embedBatch` in `packages/embeddings` and `upsertPoints`/`setPayload`/`deletePoints`/`scrollBySourcePath` in `packages/vector-store/src/qdrant-search.client.ts`. Provisioner gets `rocketrideControlDoc: false` + `MEMORY_PAYLOAD_INDEXES`. Qdrant is a derived index (`memory:reindex` rebuilds from Postgres); `search_tsv` is the lexical half (RRF via `hybrid-rank.ts`) and the full fallback.
- **Cost control**: changed-only, eligibility, batching, caps, per-project daily/monthly token budgets (estimated pre-call, reconciled nightly against `pipeline_runs`), circuit breaker -> `paused_until` shown in UI, three kill switches (`MEMORY_EXTRACTION_ENABLED` env, `settings.enabled`, `auto_extract`).
- Chat-derived facts (M4) come only from **user** messages, never assistant output (no laundering of hallucinations).

### 2.3 Read path

- Separate `ProjectMemoryReader` port (`apps/platform-api/src/modules/chat/application/project-memory-reader.port.ts`), NOT a decorator of `ChatContextRetriever` (short statements would outscore chunks, trust labels lost, doc confidence corrupted). `AskQuestionUseCase` runs both in `Promise.all`; memory read failures degrade to empty - memory can never fail a chat. The turn's query vector is reused.
- Always-on (~600 tokens): project brief, human-pinned confirmed items, top confirmed constraints/decisions, glossary terms literally in the question; never `unsupported`. On-demand: hybrid top 6 with its own `MEMORY_MIN_SCORE`.
- New pure `allocatePromptBudget` (instructions, pinned 600, recalled 600, summary 300, last turns 1500, docs 3000) - today 10 unbounded raw messages are an overflow risk.
- `buildRagPrompt(question, context, memory?)` adds a labelled block: `[M1] (CONFIRMED decision, 2026-08-12) ...` / `[M2] (UNVERIFIED risk - AI-extracted, not reviewed) ...`, with instructions to disclose reliance on UNVERIFIED items and to surface conflicts. `MessageCitation` extended with `kind: 'source'|'memory'` (`sourcePath='memory/<id>'`). Only confirmed memory may raise confidence.
- `chat_summaries` replaces the raw 10-message window: rolling summary + last 4 messages verbatim, async re-summary through the memory pipeline.
- Structured questions ("open risks without an owner"), M5: deterministic cue gate -> planner call (`expectJson`) -> closed zod `MemoryQuery` DSL -> parameterized SQL in the repository. The LLM never writes SQL; `db_postgres` node is never used (would hand DB creds to the shared engine).

### 2.4 API + UI

All under `/v1/projects/:projectId`, each declaring a permission: `memory/items` list/get/search/evidence/history (`memory:read`); manual add + "remember this" from a chat message (`memory:propose`); edit/pin (`memory:write`, `If-Match` -> 409); confirm/reject/supersede/bulk-review (`memory:confirm`); `events/:id/revert` (permission of the original action); `memory/forget`, settings, extract, dry-run, stats (`memory:admin`); export json/csv/md (`memory:export`). Forget cascade: `DeleteDocumentUseCase`/`DeleteConnectorUseCase` mark evidence `purge_requested_at` in the same transaction, a `purge` job sweeps, the hourly sweep is the backstop.

Web: `apps/web/src/pages/projects/MemoryPage.tsx` (tabs Review / Knowledge / Work items / Digests / Settings), `apps/web/src/components/memory/*` (ReviewQueue with keyboard bulk confirm/reject, EvidenceDrawer, MemoryHistoryTimeline with undo, Edit/Supersede/Forget dialogs, MemorySettingsPanel), `SECTIONS` entry `Memory` with a proposed-count badge, `useRefreshOnJobComplete(['memory_extract','memory_digest'])`, memory citation chips + "Remember this" in `components/chat/MeshMessage.tsx`.

### 2.5 Milestones

| # | Milestone | Content |
|---|---|---|
| M0 | Foundations (no user-visible change) | `packages/llm-resolution`; memory pipeline builder + `ensureMemoryPipeline` + `StructuredLlmPort`; `check.ts` / `export-pipelines.ts` / `pipelines/memory.pipe`; project columns + provisioner options; worker provider-change subscriber; `reconcile` restart-skip hardening; detect `**LLM error**` answers in chat. |
| M1 | Manual memory (thinnest valuable slice; no LLM, no Qdrant) | Core migration + repositories + `packages/memory` (kind schemas, dedupe normalization, state machine); platform-api `modules/memory`; `PostgresProjectMemoryReader` (pinned + FTS); prompt memory block + citations; Memory page, evidence drawer, "Remember this". Users teach the assistant and chat cites it next turn. |
| M2 | Semantic memory index | Qdrant client write methods, `embedBatch`, outbox drain, hybrid recall, lazy collection provisioning for existing projects. |
| M3 | Automatic extraction + review queue + forget | M3 tables, engine observer, `memory-extract` queue + processor, `apps/worker/src/memory/*` (reader, windowing, sanitizer, extractor, quote verifier, dedupe, budgets, breaker), reconcile task, delete-use-case marking, Review tab, eval harness. |
| M4 | Conversation summaries, prompt budget, LLM-judged consolidation, project brief, user-message chat facts. |
| M5 | `work_items` + evidence exclusive arc + structured query routing. |
| M6 | Digests, `review_after` staleness sweep, export, glossary/entities with person aliases. |

Risks: cost blowup (controls above), hallucinated facts (quote verification, proposed by default, precision-gated eval), stale memory (hash re-extraction marks evidence stale, `review_after`, supersession), registry restart storms (single-owner GUID + M0 restart-skip), RocketRide cloud limits (idle reaping -> invalidate + retry once; 12k-char windows; binary pipe avoided), cross-tenant leakage (per-project pipeline + collection, literal per-org key, no mixed batches). Accepted: literal BYOA keys reside in running task definitions on the shared engine (already true for chat).

---

## Phase 3+ - Roadmap toward the AI project-management tool (dependency order)

1. **R1 Structured GitHub ingestion** - issues, PRs, reviews, commits via new webhook subscriptions + the generic lane -> `work_items` with external ids, confirmed by construction. Needs M5.
2. **R2 Jira + Linear providers** into the same model (reuses R1's mapping layer; catalog entries already exist as "coming soon").
3. **R3 People + ownership resolution** - Slack/GitHub/Jira aliases -> `users` via entities. Needs RBAC + M6.
4. **R4 Role-aware status digests and standup reports** (PMO portfolio view, Developer "my week", BA requirements drift). Needs M6, R1, R3.
5. **R5 Risk / blocked detection** - deterministic rules over work items + memory (overdue, unowned, stalled PRs) plus LLM triage.
6. **R6 Notifications** - in-app (make the two decorative bells real), Slack, email; durable transport behind `PlatformEventBus`.
7. **R7 Chat streaming** via SDK `onSSE` + an API SSE endpoint. Independent; can be pulled forward.
8. **R8 Agentic read actions** - `agent_rocketride` + `memory_internal` + `mcp_client` pointing at a Meshify MCP server, with opaque per-turn read-only grants so the caller's RBAC applies (tokens never enter LLM context).
9. **R9 Agentic write actions** - create/update work items, post to Slack; proposed-action confirmation cards reuse the memory trust model.
10. **R10 Meeting-notes/transcripts provider** through the same extractor.
11. **R11 Two-way sync** to external trackers (etag, conflict policy, outbox).
12. **R12 Timeline + board UI** over `work_items`, `memory_events`, digests.
13. **Data-level visibility** enforcement using the `visibility` fields shipped in Phase 1/2 (Qdrant payload filter + SQL predicate by role).

---

## Step 0 - Branch and numbering hygiene (before any code)

- Local branch `fix/render-cd-connection` (not merged, 3 commits) contains: `f6b894f` CI deploy hardening (unrelated, worth its own PR), `0cc46fd` an earlier draft roadmap `docs/product/ai-pm-roadmap.md` (memory-first ordering, now superseded by this plan), and `7202681` with a competing `0019_actor_attribution_and_confidence.sql`. Recommendation: PR `f6b894f` alone; do not merge the other two; this plan's `0019_identity.sql` supersedes that migration.
- Before writing `0019`, run `select filename from schema_migrations order by 1 desc limit 5` against production to confirm nothing beyond 0018 was ever applied, and run the `users`-is-empty check query.
- Work branches off `development` (gitflow as used so far): `feature/identity-rbac`, then `feature/project-memory`. One commit per milestone slice, each green on `turbo typecheck build test`, lint `--max-warnings=0`, coverage thresholds, and the Postgres integration job.
- New docs: `docs/product/ai-pm-roadmap.md` (from this plan), `docs/backend/rbac.md`, `docs/architecture/memory.md`, `docs/testing/memory-evaluation.md`; fix the stale docs listed in the audit along the way (`queues-and-workers.md`, `rag-and-ingestion.md`, `connectors.md`, `frontend.md`, README "Semantic search", `llm-authorization.ts` docstring, deployment-audit RBAC rows).


## Execution order

This plan spans several releases. Each milestone is its own reviewable, independently deployable unit.

1. Step 0 (branch hygiene, production migration check, new roadmap doc committed to `docs/product/ai-pm-roadmap.md`).
2. Phase 1 M1 -> M2 -> M3 -> M5 -> M4 -> M4b on `feature/identity-rbac`, merging to `development` per milestone.
3. Phase 2 M0 -> M1 -> M2 -> M3 on `feature/project-memory`, then M4-M6.
4. Roadmap items R1+ are re-planned individually when reached.

## Verification

**Phase 1 (RBAC)**
- Unit: role/permission matrix snapshot; scope expansion; assertion tamper / expiry / wrong-org; authenticate table tests (service key ignores actor header; bff key without assertion -> 401 in `required`); `authorize` 404/403 matrix; route-permission manifest snapshot; boot fails on an untagged route.
- Integration (real Postgres, `tests/integration/identity.integration.test.ts`): 0019 on a seeded DB; composite FK rejects cross-org membership; last-owner 409; `findVisibleTo`; member removal wipes project grants; concurrent first-sync elects exactly one owner.
- End to end: extract `apps/platform-api/src/app.ts` (`buildApp(container)`) from `main.ts`, run it behind the real BFF proxy with Clerk `getAuth` mocked: forged `x-meshify-actor` is overwritten; a member cannot see a private project (404); a Viewer gets 403 on upload; SSE ends with `revoked`. Then the live local stack in the browser: Members page, role change, gated buttons per role, non-member empty state (pixel-check light and dark themes).
- Cutover gate: `meshify_rbac_shadow_denials_total` at zero for legitimate traffic before flipping `enforce`.

**Phase 2 (memory)**
- Unit: state machine, dedupe normalization, sanitizer (section spoofing), quote verifier, zod salvage/repair, judge-verdict guard matrix, budget allocator, `combineConfidence`, no-`select *` rule.
- Integration (`tests/integration/project-memory.integration.test.ts`): partial-unique dedupe incl. rejected rows, exclusive arc, append-only trigger, event+mutation atomicity, purge marking in the delete transaction, `due_on` round-trip under UTC / UTC+5:30 / UTC-8, `skip locked` drain.
- Gateway: snapshot of `memory.pipe` (components first, literal UUID `project_id`, source config shape), `pnpm --filter @meshify/rocketride-gateway check` passes 5/5 against local AND cloud engines, `FakeStructuredLlm`.
- End to end on the local stack: upload a fixture doc + sync a Slack fixture -> proposals appear with verified quotes; confirm one -> next chat turn cites `[M1]`; delete the doc -> evidence purged + orphan policy applied; switch LLM provider -> next extraction uses the new vendor; two worker replicas -> no restart storm.
- Eval gates: `scripts/memory-eval.mjs` (`--min-precision 0.8 --min-recall 0.6 --max-injection-leaks 0`), answer uplift with memory on vs off, and `retrievedDocuments` identical in both modes; existing `scripts/rag-eval.mjs` recall must not regress.
