# Phase 2 — Proposed Architecture: First-Class OAuth Integrations

Design for Meshify-managed GitHub & Slack integrations: one Meshify-owned app per provider, org-scoped installations, encrypted credentials in Postgres, webhook-driven sync, SSE live updates, optional enterprise BYOA.

---

## 1. Core model: two levels, extending what exists

The single most important design decision: **do not replace the Connector Framework — layer an org-scoped `Integration` above it.**

```
Organization ──< Integration            (org-scoped authorization: a GitHub App
                    │                    installation, a Slack workspace install;
                    │                    owns credentials, webhooks, status)
                    │
Project ──────< KnowledgeConnector      (project-scoped usage: THIS repo, THIS
                    │                    workspace's channels — existing aggregate,
                    │                    gains integration_id)
                    └─< repositories / slack_workspaces / slack_channels (existing detail tables)
```

- **Integration** = "Org A authorized Meshify on GitHub org `acme` / Slack workspace `acme.slack.com`". One OAuth per org per external account. Matches Vercel/Linear/Sentry semantics.
- **Connector** (existing) = "Project P ingests repo `acme/api`" / "Project P ingests channels #eng, #support". Projects reuse the org's integration — connecting a second repo or project never re-prompts OAuth.
- Credentials live only at the integration level, encrypted. Detail tables stop holding tokens.

## 2. Database design (migrations `0011`–`0013`, additive + backfill)

```sql
-- 0011_integrations.sql
create table integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('github','slack')),   -- widen per provider
  mode text not null default 'managed' check (mode in ('managed','byoa')),
  external_account_id text not null,       -- GitHub: account id of installation target; Slack: team_id
  external_account_name text not null,     -- 'acme' / 'Acme Inc'
  status text not null default 'pending'
    check (status in ('pending','active','error','revoked','disconnected')),
  metadata jsonb not null default '{}',    -- github: {installationId, accountType, avatarUrl, repoSelection}
                                           -- slack: {teamId, botUserId, scope, appId}
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider, external_account_id)   -- multiple GitHub orgs per Meshify org: yes
);
create index idx_integrations_org on integrations(org_id);
create index idx_integrations_provider_account on integrations(provider, external_account_id);

create table integration_credentials (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references integrations(id) on delete cascade,
  kind text not null check (kind in
    ('access_token','refresh_token','installation_token',
     'webhook_secret','app_private_key','app_client_secret','app_signing_secret')),
  encrypted_value text not null,           -- versioned envelope: v1.<iv>.<tag>.<ciphertext>
  expires_at timestamptz,                  -- null = non-expiring (Slack bot token w/o rotation)
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, kind)
);

create table oauth_states (                -- server-side, single-use (replaces signed-state + sessionStorage)
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,         -- HMAC-SHA256(pepper, random 32-byte token); token itself never stored
  org_id uuid not null references organizations(id) on delete cascade,
  provider text not null,
  project_id uuid references projects(id) on delete cascade,  -- optional: auto-attach after connect
  intent text not null default 'connect' check (intent in ('connect','reconnect')),
  integration_id uuid references integrations(id) on delete cascade,  -- set for reconnect
  return_path text,                        -- SPA path to land on after completion
  created_by_key_id uuid,
  expires_at timestamptz not null,         -- now() + 15 min
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table webhook_events (              -- receipt ledger: dedup, audit, async processing
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  delivery_id text not null,               -- GitHub X-GitHub-Delivery; Slack event_id (fallback: hash)
  event_type text not null,                -- push | installation | installation_repositories | message | ...
  integration_id uuid references integrations(id) on delete set null,
  payload jsonb not null,
  status text not null default 'received'
    check (status in ('received','queued','processed','skipped','failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, delivery_id)           -- redelivery => idempotent no-op
);
```

```sql
-- 0012_integration_links.sql (alters + backfill)
alter table knowledge_connectors add column integration_id uuid references integrations(id) on delete set null;
alter table repositories
  add column github_repo_id bigint,        -- stable across renames; webhook resolution key
  add column owner text, add column name text,
  add column last_synced_at timestamptz;
create index idx_repositories_github_repo on repositories(github_repo_id);
alter table slack_workspaces add column integration_id uuid references integrations(id) on delete set null;
-- Backfill (in-transaction):
--  * one integrations row per distinct (org, team_id) from slack_workspaces×projects,
--    status 'active', credentials: copy most-recent encrypted_access_token as kind 'access_token'
--    (ciphertext is key-compatible; legacy unversioned envelope still decryptable)
--  * link slack_workspaces.integration_id + knowledge_connectors.integration_id
--  * repositories: parse owner/name from remote_url (github_repo_id backfilled lazily on first sync)
-- slack_workspaces.encrypted_access_token retained as deprecated fallback; dropped in a later cleanup migration.

-- 0013_job_dedupe.sql
alter table pipeline_jobs add column dedupe_key text;
create unique index idx_pipeline_jobs_dedupe on pipeline_jobs(dedupe_key) where status = 'queued';
-- insert ... on conflict do nothing → collapses webhook bursts/redeliveries while allowing
-- exactly one queued follow-up behind a running job (running jobs don't block re-queue).
```

No provider-specific tables added; provider variance lives in `metadata`/`kind`. Existing `slack_channels.selected` keeps working unchanged because `slack_workspaces` remains the per-project attachment record — it just no longer owns the token.

## 3. Provider framework (`packages/integrations`)

```ts
interface IntegrationProvider {
  readonly provider: 'github' | 'slack';
  buildConnectUrl(integrationCtx, stateToken): string;          // github: installations/new?state=; slack: oauth/v2/authorize
  completeConnect(params, ctx): Promise<ExternalAccount>;        // verify + exchange; returns identity + credentials to store
  refreshCredentials?(integration, vault): Promise<void>;        // slack rotation; github installation-token mint
  revoke?(integration, vault): Promise<void>;                    // slack auth.revoke; github DELETE /app/installations/{id}
  verifyWebhook(rawBody, headers, secret): boolean;              // HMAC per provider, timing-safe
  describeWebhook(payload): { deliveryId, eventType, externalAccountId };
}
```

- **`CredentialVault`** (the only component that touches `integration_credentials`): `getToken(integration, kind)` decrypts; for GitHub it returns the cached `installation_token` if >5 min remaining, else mints via App JWT (managed creds from env; BYOA creds from the vault itself), persists encrypted with `expires_at`, returns. This moves the per-process in-memory token cache into shared, encrypted DB state — all workers/replicas reuse one token per installation.
- **Encryption**: reuse `secret-encryption.ts`, extended with a version prefix (`v1.iv.tag.ct`); decrypt accepts legacy unversioned envelopes. New optional env `INTEGRATION_ENCRYPTION_KEY` (falls back to `ORG_KEY_ENCRYPTION_KEY`) starts decoupling the triple-duty key without a flag-day.
- `packages/github` gains `listInstallationRepos(installationId)`, `getInstallation(installationId)`, and an auth mode keyed by installation id (today it discovers per owner/repo); existing tarball/compare/contents methods unchanged. `packages/slack` OAuth helpers absorb refresh-token fields; `oauth-state.ts` signed-state retired in favor of `oauth_states` rows.

## 4. OAuth flows

### GitHub (App installation flow — Meshify owns ONE GitHub App)

```
UI "Connect GitHub" → POST /v1/integrations/github/connect {projectId?, returnPath?}
  → create oauth_states row → { url: https://github.com/apps/<slug>/installations/new?state=<token> }
→ browser navigates; user picks account + repos; GitHub redirects to the app's Setup URL:
  <web>/oauth/github/callback?installation_id=…&setup_action=install|update&state=<token>
→ Clerk-gated SPA callback page → POST /v1/integrations/github/callback {installationId, setupAction, state}
  → server: consume state (single-use, unexpired, org == req.auth.orgId)
  → App JWT → GET /app/installations/{id} → verify it's OUR app's installation; capture account
  → upsert integrations (status active, metadata.installationId) 
  → if state.projectId: return {integrationId, projectId} so UI opens the repo picker
→ SPA lands on return_path; repo picker lists GET /v1/integrations/:id/resources
```

- Installations are bound to an org **only through a state-carrying flow we initiated** — a bare `installation_id` arriving without valid state is never claimed (installation ids are guessable integers; this closes the hijack window). Users who installed directly on GitHub just click "Connect GitHub" in Meshify; GitHub short-circuits to the callback with state since the app is already installed.
- `setup_action=update` (repo grant changes) re-enters the same callback and refreshes `metadata.repoSelection` + accessible-repo state.
- Token model: installation tokens (1h) minted on demand by the vault. "Reauthorize" = GitHub-side settings redirect; "Reconnect" = new state with `intent:'reconnect'`.

### Slack (OAuth v2 — Meshify owns ONE Slack app; unchanged mechanics, lifted to org level)

Same shape as today's flow, with three changes: state moves to `oauth_states` (no sessionStorage dependency — completion resolves org/project purely from state), the token lands in `integration_credentials` (kind `access_token`, plus `refresh_token`/`expires_at` when Slack token rotation is enabled on the app), and the integration is org-scoped. Attaching a workspace to a project (`POST /v1/projects/:id/connectors/slack {integrationId}`) creates the connector + `slack_workspaces` row and lists channels — no second OAuth.

## 5. API surface (platform-api)

**Org-scoped module `modules/integrations`** (authGuard; org from `req.auth.orgId`):

| Route | Purpose |
|---|---|
| `GET  /v1/integrations` | List org integrations + status/account/health/connected-resource counts |
| `POST /v1/integrations/:provider/connect` | Begin flow → `{url}` (body: `projectId?`, `returnPath?`) |
| `POST /v1/integrations/:provider/callback` | Complete (GitHub: installationId+state; Slack: code+state) |
| `POST /v1/integrations/:integrationId/reconnect` | New consent/settings URL |
| `DELETE /v1/integrations/:integrationId` | Disconnect: best-effort revoke, credentials deleted, dependent connectors → `disconnected` |
| `GET  /v1/integrations/:integrationId/resources` | Repo picker (GitHub: installation repos + already-connected flags, paginated) / channel list (Slack) |
| `PUT  /v1/integrations/:integrationId/config` | BYOA credentials (enterprise) — write-only, never echoed |
| `GET  /v1/integrations/stream` | SSE: org-scoped integration events |

**Webhooks (public router, mounted before `express.json()`/`authGuard`, `express.raw` + size cap):**

| Route | Auth |
|---|---|
| `POST /v1/integrations/webhooks/github` | `X-Hub-Signature-256` HMAC vs managed app secret |
| `POST /v1/integrations/webhooks/slack` | Slack v0 signature (5-min timestamp tolerance) + `url_verification` challenge echo |
| `POST /v1/integrations/webhooks/:provider/:integrationId` | BYOA: per-integration secret from vault (enterprise apps point their webhook here) |

**Project-scoped changes:** `POST /v1/projects/:id/repositories` accepts `{integrationId, githubRepoId | fullName}` (URL-paste retained for back-compat, validated against the installation when one exists); `POST /v1/projects/:id/connectors/slack {integrationId}` attaches a workspace; existing channel-select/sync/list/delete routes unchanged.

Frontend keeps talking **only to the BFF** (`/api/*` proxy, zero BFF changes); provider tokens/secrets never appear in any DTO.

## 6. Webhook processing pipeline (receive fast, process async)

```
provider → POST /webhooks/* → verify signature (timing-safe, raw body)
  → insert webhook_events (on conflict (provider, delivery_id) do nothing → 200 & done)
  → enqueue webhook-events job {webhookEventId}
  → 200 within ms (never do provider API calls in the receiver)

worker webhook-event.processor:
  github push                → resolve repos by github_repo_id (fallback owner/name) across projects,
                               guard ref == default branch → enqueue repo-sync, dedupe_key sync_repo:{repoId}:{afterSha}
  github installation        → created/claimed elsewhere: mark integration active/revoked/suspended
  github installation_repos  → refresh accessible set; auto-flag connectors of removed repos
  github repository renamed  → update owner/name/remote_url
  slack message/member_join  → resolve integration by team_id (+api_app_id) → workspaces with that channel selected
                               → enqueue slack-sync per workspace, dedupe_key slack_sync:{workspaceId}, 45s delay (burst coalescing)
  slack channel_rename       → update slack_channels
  slack app_uninstalled / tokens_revoked → integration revoked, connectors flagged, SSE event
  → mark webhook_events processed/skipped/failed (retries via DEFAULT_JOB_OPTS)
```

Sync execution reuses the existing incremental machinery (`repo-sync`/`slack-sync` processors, `resolveIngestToken`, `rag.ingestFiles`, `JobProgress` → SSE). Two hardening fixes ride along: **purge-before-reingest** for changed repo files (copying Slack's `deleteBySourcePaths` pattern — fixes the documented stale-vector bug) and **deterministic dedupe keys** (0013) for all webhook-originated enqueues.

**Safety net (webhooks miss events):** new `integration-maintenance` repeatable job (BullMQ 5.80 Job Scheduler, e.g. hourly): refresh expiring credentials (Slack rotation), enqueue a low-priority sync for integrations stale > 24h, prune processed `webhook_events` (30-day retention). This is reconciliation, not polling — the UI never polls.

## 7. Realtime updates

Job progress (sync/ingest triggered by webhooks) already flows through the existing per-project SSE — zero changes. Added: a second Redis channel `meshify:integrations` carrying `IntegrationEvent {orgId, integrationId, provider, kind: connected|revoked|resources_changed|webhook_received|sync_scheduled, at}` → `IntegrationEventHub` (same fan-out pattern as `JobEventHub`, keyed by orgId) → `GET /v1/integrations/stream`. The Integrations page opens this EventSource while mounted; OAuth completion, uninstalls, and webhook activity render live. New job types get `PRESENTATION`/`TYPE_LABELS` entries so the existing Job Progress Center displays webhook-triggered syncs with no new UI plumbing.

## 8. Enterprise mode (BYOA)

- `integrations.mode = 'managed' | 'byoa'`, chosen per org integration. Default managed — users never see app credentials.
- BYOA setup: org admin enters GitHub App ID / private key / webhook secret / client secret (or Slack client id/secret/signing secret) via `PUT /config`; stored encrypted as `app_*` credential kinds; DTOs never echo them back (write-only + `configuredAt` timestamps).
- BYOA apps point their webhook at `/v1/integrations/webhooks/:provider/:integrationId` — per-integration URL means per-integration secret resolution with no signature-guessing; managed apps use the shared route. Vault picks BYOA app creds over env automatically when minting tokens.

## 9. Security model

- **Secrets**: AES-256-GCM at rest (versioned envelope), decrypt only in platform-api/worker at point of use; never serialized to DTOs/logs (logger redaction extended with body-field paths for webhook/config routes); frontend sees only status + display metadata.
- **OAuth**: server-side exchange; server-side single-use state (hash-stored, 15-min TTL, org-bound, `consumed_at`); callback requires an authenticated Clerk session through the BFF; GitHub installations only claimable via state-bound flows.
- **Webhooks**: timing-safe HMAC on the raw body before any parsing side-effects; Slack timestamp tolerance ±5 min (replay); `(provider, delivery_id)` unique (redelivery); 1–2 MB payload cap; per-provider fixed-window rate limit keyed by remote identity (the API-key limiter doesn't apply pre-auth); receivers do no provider I/O.
- **Scopes**: GitHub App permissions `contents:read` + `metadata:read`, events `push, installation, installation_repositories, repository`; Slack scopes unchanged (already minimal read-only). BYOA validates granted scopes and surfaces gaps as integration `error` status.
- **Tenancy**: every integration row is org-FK'd; org-scoped loader mirrors `loadSlackWorkspace` ("cross-org probe looks identical to missing"); project attach verifies the integration belongs to `req.project`'s org.

## 10. Env & config changes

| Var | Change |
|---|---|
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_WEBHOOK_SECRET` | Required → **optional** (503-if-unconfigured pattern, like Slack). Semantics: *Meshify's managed app*, set once by the operator — never by customers. Webhook secret finally consumed. |
| `GITHUB_APP_SLUG` | **New** (optional): builds `installations/new` URL. |
| `SLACK_*` | Unchanged semantics (managed app); `SLACK_SIGNING_SECRET` finally consumed by the events receiver. |
| `INTEGRATION_ENCRYPTION_KEY` | **New** (optional, falls back to `ORG_KEY_ENCRYPTION_KEY`). |

Self-hosters configure two managed apps once per deployment; individual users/orgs configure nothing.

## 11. Frontend UX

- **New "Integrations" page** per project (WorkspaceShell nav + Settings link): one card per provider — status pill (reusing `ConnectorStatusBadge` states), account name, resource counts, last sync, and `Connect / Reconnect / Disconnect / Sync now` actions. Cards state clearly when the org already has the integration ("Connected by your organization — select repositories for this project").
- **Connect GitHub** → full-page redirect to the install URL (Slack precedent); return via generalized `/oauth/:provider/callback` route + one `OAuthCallbackPage` (replaces `SlackCallbackPage`, no sessionStorage — server resolves context from state and returns `returnPath`).
- **Repo picker** replaces URL paste: searchable list of the installation's repos (already-connected badged), multi-select → connect + ingest. "Add more repos on GitHub" deep-links to the installation settings page for grant changes (webhook `installation_repositories` refreshes us automatically).
- **Slack**: "Connect Slack" appears once per org; projects attach the workspace then pick channels with the existing picker. Existing sync/disconnect affordances stay.
- Live updates via the org SSE stream + existing job stream; no polling anywhere; `useRefreshOnJobComplete` extended with new job types.

## 12. Scalability posture

Receipt is O(1) (verify + insert + enqueue; unique-index dedup); processing is horizontal via stateless workers; sync fan-out is bounded by dedupe keys (one queued job per repo-sha / workspace); shared DB-cached GitHub tokens eliminate per-process re-minting across N workers; SSE hubs are per-replica fan-outs over Redis Pub/Sub (existing proven pattern, no sticky sessions); per-provider client already handles 429/Retry-After. Thousands of orgs = rows + queue depth, no per-tenant processes.

## 13. Migration strategy (zero-downtime, additive-first)

1. Migrations 0011–0013 are additive; Slack backfill creates integrations from existing workspaces in the same transaction — **existing Slack connections keep working unchanged** (readers prefer vault, fall back to legacy column until the cleanup migration drops it).
2. Existing URL-pasted GitHub repos keep syncing via the current on-demand owner/repo→installation discovery (retained as fallback); the UI surfaces "Upgrade to managed connection" which binds them to the org integration; `github_repo_id`/owner/name backfill lazily on next successful sync.
3. Env loosening (`GITHUB_APP_*` optional) is deploy-safe: worker logs a warning and repo features 503 gracefully when unset, instead of four processes refusing to boot.
4. API changes are additive (new module + new body variants); no existing endpoint changes shape or is removed.
5. Rollback story: new tables/columns are ignored by old code; the only riskier step (dropping `slack_workspaces.encrypted_access_token`) is deferred to a final cleanup migration shipped only after verification.

## 14. Implementation plan (Phase 5 milestones = small commits on `feature/oauth-managed-integrations`)

| # | Milestone | Scope |
|---|---|---|
| M0 | Branch + design docs committed | docs only |
| M1 | Schema + data-access | 0011–0013, entities/repos for integrations/credentials/oauth_states/webhook_events, versioned encryption, backfill + tests |
| M2 | `packages/integrations` core | provider interface, CredentialVault, state service; GitHub provider (install URL, callback verification, installation repos, DB-cached tokens); Slack provider adapted onto framework |
| M3 | platform-api `integrations` module | org routes, resources, connect/callback/reconnect/disconnect, SSE hub + stream; rewire repositories/slack modules onto the vault |
| M4 | Webhook receivers + processor | raw-body router, signature verification, `webhook_events` + queue + worker processor, deterministic dedup, repo purge-before-reingest fix |
| M5 | Maintenance scheduler | Job Scheduler: token refresh, staleness safety-net, event retention |
| M6 | Frontend | Integrations page, generalized OAuth callback, repo picker, Slack attach flow, SSE client, presentation entries |
| M7 | Enterprise BYOA | config endpoint + vault resolution + per-integration webhook path + settings UI |
| M8 | Cleanup + docs + tests | dead config removed/wired, handbook pages, `.env.example`, k8s ingress note, stale comments/READMEs, test sweep |

Each milestone ends with typecheck + tests green and a milestone report (what changed / why / files / remaining).
