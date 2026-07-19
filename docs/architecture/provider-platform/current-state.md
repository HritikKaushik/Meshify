# Phase 1 — Current-State Findings: Integrations, Credentials, Sync & Realtime

Meshify monorepo audit for the OAuth-managed integrations feature. All paths repo-relative.
Verified against code on branch `main` (2026-07-20); five parallel deep-dives (GitHub, Slack, auth/data, frontend, queues/workers).

---

## 1. System topology (verified)

- **pnpm + Turborepo**: apps `web` (React 18/Vite/Clerk), `bff` (Express, Clerk→org-key proxy), `platform-api` (Express, Clean Architecture), `worker` (BullMQ processors), `observability` (RocketRide traces). Packages: `config`, `shared`, `data-access`, `vector-store`, `embeddings`, `queues`, `object-storage`, `github`, `slack`, `rocketride-gateway`, `testing`.
- **Auth chain**: Browser (Clerk cookie) → BFF (`apps/bff/src/modules/auth/resolve-org-for-clerk.ts` auto-provisions org + `msk_` API key, stores it AES-encrypted in `clerk_org_links`) → platform-api (`authGuard` HMAC-peppered lookup → `req.auth = {orgId, keyId, scopes}`). Browser never holds a platform credential. `scopes` are plumbed but **never enforced**.
- **Tenancy**: Postgres `organizations` is the org source of truth (Clerk orgs mapped via `clerk_org_links`). Everything cascades from `projects.org_id`. `projectIsolationGuard` 404s cross-org access. Org-scoped routes read `req.auth.orgId` directly (`projects.controller.ts:37,49`).
- **Public surface**: only **platform-api** has ingress (`infrastructure/kubernetes/base/platform-api.ingress.yaml`, host `api.meshify.example.com`). BFF/web are not deployed in compose/k8s manifests. **Any webhook receiver must live on platform-api, mounted before `authGuard`** (`apps/platform-api/src/main.ts:232`); note `express.json()` is global at `main.ts:225`, so a signature-verifying receiver needs raw-body handling mounted above it.

## 2. GitHub integration — current implementation

**Model: one global GitHub App via `.env`; connect-by-URL-paste; worker-only credentials; no webhooks.**

- `packages/github/src/github-app-auth.ts` — `GitHubAppAuth`: RS256 App JWT (9-min expiry), then `GET /repos/{owner}/{repo}/installation` to *discover* the installation id on demand, then `POST /app/installations/{id}/access_tokens`. Installation tokens cached **in-memory per process** keyed by `owner/repo` (60s expiry margin). Installation ids are **never persisted**.
- `packages/github/src/github-repo-client.ts` — raw-fetch client (no octokit, no git binary): `getHead`, `downloadTarball` (tarball API, not clone), `compare` (incremental diff), `getFileContent` (1 MB cap). Header comment explicitly anticipates a push-webhook receiver "when it lands".
- **Connect flow**: `POST /v1/projects/:id/repositories` with `{source:'github', remoteUrl}` (`repositories.controller.ts:47`) → `ConnectGitHubRepositoryUseCase` → `parseGitHubUrl` (github.com-only regex, the SSRF guard, in `repository.entity.ts:20-24`) → connector + repo rows + `clone_repo` job. Frontend is a free-text URL input (`RepositoriesPage.tsx:84`).
- **Sync**: manual only — `POST .../repositories/:repoId/sync` → `repo-sync` queue → `repo-sync.processor.ts`: `getHead` → `compare(lastSyncedCommit, head)` → per-file re-ingest; removed files `markDeleted`. Known in-code limitation: **stale Qdrant points are not purged** on changed files (`repo-sync.processor.ts:31-35`); retries can duplicate points (no purge-before-reingest).
- **Status lifecycle**: `pending → cloning → synced|failed` on `repositories.sync_status`; connector status derived at read time.
- **Env consumers**: `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` used **only** at `apps/worker/src/main.ts:77`. All three `GITHUB_APP_*` vars are **required** by the shared zod schema (`packages/config/src/env.ts:63-66`) so **all four backend processes fail to boot without them**, even though only the worker uses two of them.
- **`GITHUB_APP_WEBHOOK_SECRET` is dead config** — zero code consumers (docs claiming "webhook verification" are wrong). No webhook route, no `X-Hub-Signature-256` verification anywhere.
- **DB**: `repositories` has `remote_url`, `default_branch`, `last_synced_commit`, `sync_status`, `archive_object_key`, `connector_id`. **No** installation id, github repo id, owner/name columns, or `last_synced_at`. No `github_installations` table exists.
- **Tests**: none for App auth, repo client, connect/sync use cases, or repo processors.

## 3. Slack integration — current implementation

**Model: one global Slack app via `.env` (optional vars); project-scoped OAuth; encrypted bot token per (project, team); pull-based manual sync; no Events API.**

- OAuth: `POST .../connectors/slack/oauth/start` → `signState({projectId, nonce, issuedAt})` HMAC-SHA256 with **`ORG_KEY_ENCRYPTION_KEY`**, 15-min TTL (`packages/slack/src/oauth-state.ts`) → browser navigates to `oauth/v2/authorize`. Static redirect URI → Clerk-gated SPA route `/oauth/slack/callback` (`SlackCallbackPage.tsx`), which needs `projectId` from `sessionStorage` (brittle: lose the tab → can't complete) → `POST .../oauth/complete` → `oauth.v2.access` server-side → bot token stored via `encryptSecret` in `slack_workspaces.encrypted_access_token`.
- Crypto (`packages/data-access/src/provisioning/secret-encryption.ts`): AES-256-GCM, key = SHA-256(`ORG_KEY_ENCRYPTION_KEY`), fresh 12-byte IV, envelope `iv.authTag.ciphertext` (base64, dot-joined). **No key-version tag.** Same env var does triple duty: org API key encryption, Slack state HMAC, Slack token AES.
- Scopes (`SLACK_BOT_SCOPES`): `channels:read, groups:read, channels:history, groups:history, users:read` — minimal, hardcoded.
- **No token rotation/refresh**: `oauth.v2.access` response's `refresh_token`/`expires_in` ignored; no `oauth.v2.exchange`; no expiry columns. **No `auth.revoke` on disconnect** — bot token stays live at Slack after teardown.
- **Sync**: pull-based via `conversations.history` with per-channel cursor `slack_sync_state.last_synced_ts`. Triggers are exactly two HTTP calls: channel-selection save (`slack-ingest`) and manual Sync button (`slack-sync`). Incremental runs must re-fetch replies for **every stored thread** each run because late replies never resurface in `history` — the exact cost Events API would remove.
- **`SLACK_SIGNING_SECRET` is dead config** (env comment says "reserved for a future Events API receiver"). No `url_verification` handler, no `x-slack-signature` verification anywhere.
- DB (`0009_slack_connectors.sql`): `slack_workspaces` (unique `(project_id, team_id)`, encrypted token per row — **project-scoped, not org-scoped**), `slack_channels` (`selected` flag), `slack_conversations` (content-hash dedup, purge-before-reingest — the good idempotency pattern), `slack_sync_state`.

## 4. Realtime & polling — current state

- **SSE system already built** (`docs/backend/realtime-jobs.md`): worker `JobProgress` → Redis Pub/Sub channel `meshify:jobs` (`packages/queues/src/job-events.ts`, `JobEvent {jobId, projectId, jobType, title, phase: running|progress|completed|failed|retry, stage?, percent?, ...}`) → `JobEventHub` in platform-api → `GET /v1/projects/:id/jobs/stream` (15s heartbeat, snapshot seed) → BFF streams transparently → `JobsProvider` (one `EventSource` per project) → generic `JobProgressCenter`/`JobCard` → pages refresh via `useRefreshOnJobComplete`.
- **Frontend polling: already eliminated** (commit `619b8c5`). Full sweep found only: a 1s display clock (`JobProgressCenter.tsx:21`, no network), a 6s one-shot linger, an autofocus timeout. No react-query/SWR; hand-rolled `useAsync`. One stale comment (`DocumentsPage.tsx:55-56` still says "live-polls") — cosmetic.
- **Backend scheduling: none.** No cron, no BullMQ repeatable/schedulers, no `QueueScheduler`. Every ingest/sync is a user-triggered HTTP call. BullMQ **5.80.0** is installed, so Job Schedulers (`upsertJobScheduler`) are available when we need them.

## 5. Queues, jobs, idempotency

- 5 queues (`document-ingest` c5, `repo-ingest` c2, `repo-sync` c3, `slack-ingest` c2, `slack-sync` c2), shared `DEFAULT_JOB_OPTS`: 5 attempts, exp backoff 5s, `removeOnFail:false` (Redis DLQ) + `pipeline_jobs` as the durable DLQ mirror (`queued|running|completed|failed|dead_letter`, now with `progress`/`stage`).
- Producer triad everywhere: `randomUUID()` → `pipeline_jobs.create` → `queue.add(name, payload, {jobId: pipelineJobId})`. **jobId is a fresh UUID per call** — dedupes only BullMQ-internal retries, not repeated user actions and **not webhook redeliveries**.
- Content-level dedup exists for documents (SHA-256) and Slack conversations (content hash + purge-before-reingest). **Repos have none**, and repo vector writes are not retry-idempotent (batches resent from the top; no point purge).
- Lifecycle wrapper `run-pipeline-job.ts` used only by Slack processors; document/repo processors inline duplicate copies (documented as "adopt later").
- `pipeline_jobs.job_type` includes dead members `reindex`, `cleanup` (no producer/processor).

## 6. Where GitHub/Slack credentials are currently expected (complete inventory)

| Credential | Declared | Consumed by | Status |
|---|---|---|---|
| `GITHUB_APP_ID` | `env.ts:64` (required) | `apps/worker/src/main.ts:77` only | Global app cred; boot-required by all 4 apps |
| `GITHUB_APP_PRIVATE_KEY` | `env.ts:65` (required) | `apps/worker/src/main.ts:77` only | Same |
| `GITHUB_APP_WEBHOOK_SECRET` | `env.ts:66` (required) | **nothing** | Dead config |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | `env.ts:73-74` (optional) | `apps/platform-api/src/main.ts:152-157` | Global app cred; 503-if-unset pattern |
| `SLACK_REDIRECT_URI` | `env.ts:75` (optional) | same | Static redirect to web callback |
| `SLACK_SIGNING_SECRET` | `env.ts:77` (optional) | **nothing** | Dead config (reserved) |
| `ORG_KEY_ENCRYPTION_KEY` | `env.ts:25` (optional, min 32) | BFF (org keys), platform-api (Slack state+token), worker (token decrypt) | Triple-duty key, no versioning |
| Per-workspace Slack bot token | — | `slack_workspaces.encrypted_access_token` | Only per-tenant credential in DB today |

Plus deployment copies: `.env.example:54-67`, `infrastructure/kubernetes/base/app-secrets.example.yaml`, `docs/reference/environment-variables.md`.

## 7. Technical debt register (relevant to this feature)

1. Dead config: `GITHUB_APP_WEBHOOK_SECRET`, `SLACK_SIGNING_SECRET` declared but unconsumed.
2. Boot coupling: `GITHUB_APP_*` required by all four processes; only worker uses them.
3. No per-org GitHub identity: installation ids discovered per call, never stored; token cache per-process in-memory.
4. Repo sync not retry-idempotent; stale vectors not purged (Slack pattern exists to copy).
5. Random `jobId`s → no dedup primitive for webhook redeliveries or double-clicks.
6. `ORG_KEY_ENCRYPTION_KEY` triple duty; ciphertext has no key-version tag → rotation is a flag-day.
7. Slack disconnect doesn't `auth.revoke`; no refresh-token support.
8. OAuth callback depends on `sessionStorage` (state param carries projectId but completion URL needs the stored id).
9. Lifecycle-wrapper duplication in 3 older processors; dead `reindex`/`cleanup` job types; stale `packages/queues/README.md` (3 vs 5 queues); stale DocumentsPage comment.
10. Zero tests on the GitHub auth/client/ingest path; `scopes` plumbed but unenforced.

## 8. Files requiring changes (by area)

**Config/env**: `packages/config/src/env.ts`, `.env.example`, `infrastructure/kubernetes/base/app-secrets.example.yaml`, `docs/reference/environment-variables.md`.

**Data**: new migrations `packages/data-access/migrations/0011+`; new entity/repository triads under `packages/data-access/src/integrations/**` (+ index exports); alters touching `repositories`, `knowledge_connectors`, `slack_workspaces`, `pipeline_jobs`; `secret-encryption.ts` (version prefix).

**New package**: `packages/integrations` (provider framework, credential vault, webhook verification) — GitHub/Slack provider adapters reusing `packages/github` + `packages/slack` primitives; `packages/slack/src/oauth-state.ts` retired in favor of DB-backed state (or generalized).

**platform-api**: new `modules/integrations/**` (org-scoped routes + webhook receivers + SSE), rewiring in `main.ts` (mount webhook router before `express.json()`/`authGuard`); edits to `modules/repositories/**` (picker-based connect, installation-aware), `modules/slack/**` (org-level workspace attach; vault-sourced tokens), `modules/connectors/**` (integration linkage in list/delete).

**worker**: `src/main.ts` (vault-backed GitHub client, new workers), new `processors/webhook-event.processor.ts`, `processors/integration-maintenance.processor.ts`; edits to `repo-sync.processor.ts` (purge-before-reingest, deterministic dedup), `slack/ingest-workspace.ts` (token via vault).

**queues**: new `webhook-events` + `integration-maintenance` queue defs; dedupe-key support.

**web**: new Integrations page + generalized `/oauth/:provider/callback`; `App.tsx` routes; `api.ts` methods; `RepositoriesPage.tsx` (repo picker), `SlackPage.tsx` (attach from org integration); `job-model.ts` presentation entries.

**bff**: no changes (pure streaming proxy).

**docs**: handbook updates (`docs/backend/connectors.md`, new `docs/backend/integrations.md`, env reference, data model).
