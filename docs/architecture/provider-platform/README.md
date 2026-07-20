# Architecture v2 — The Meshify Provider Platform

Supersedes the Phase 2 "integrations" design where they differ; carries it forward everywhere else
(DB core, OAuth flows, webhook receipt pipeline, security model, migration strategy all survive).
This document adds the provider-agnostic layer and records every trade-off decision explicitly.

---

## 0. Decision record: adopting, adapting, deferring

Honest engineering assessment of the vNext recommendations against the existing codebase. "Seam now"
means: we ship the interface so the capability is pluggable later without core changes — the point of
the exercise — while deferring heavyweight implementations until a real consumer exists.

| # | Recommendation | Decision | Rationale |
|---|---|---|---|
| 1 | `packages/providers` with base contracts, registry, self-contained provider modules | **Adopt** | Right shape, cheap now. One workspace package `@meshify/providers` with `base/`, `registry/`, `github/`, `slack/`, `testing/` dirs — not one pnpm package per provider (build-graph overhead, no isolation benefit). |
| 2 | Keep provider SDKs separate vs folded in | **Adapt** | `packages/github` / `packages/slack` stay as thin transport SDKs (existing, working, tested pattern — the handbook already mandates "keep any new SDK behind its own gateway package"). All provider *logic* lives in `@meshify/providers/<id>`. A future provider may inline its client or add a transport package; both are conformant. |
| 3 | One god `Provider` interface | **Adapt** | Interface-segregated capability contracts instead: `Provider` (descriptor) + `OAuthCapable`, `WebhookCapable`, `SyncCapable`, `ResourceBrowsingCapable`, `HealthCapable`, `CitationCapable`, `ByoaCapable`. Declared capabilities and implemented interfaces are cross-checked by contract tests. No provider implements methods it can't support; no switch statements anywhere — resolution is registry + type guards. |
| 4 | Provider Registry | **Adopt** | `ProviderRegistry.register/get/list`; composition roots register; everything resolves through it. Also accepts **descriptor-only** registrations (`availability: 'coming_soon'`) so the marketplace catalog is data, not fake code. |
| 5 | Capabilities drive UI | **Adopt** | `GET /v1/providers` returns descriptors; the marketplace and detail panels render affordances (Connect, Sync now, Pick resources, Health) purely from capability flags. |
| 6 | Integration Marketplace | **Adopt** | Single Integrations surface per project listing the full catalog (available + coming soon), org-level connection state, and project-level attachments. |
| 7 | Provider Health | **Adopt** | Health states `healthy · syncing · token_expired · permission_changed · webhook_broken · needs_reauthorization · partially_connected · disconnected · unknown` stored on the integration (`health`, `health_detail`, `health_checked_at`). Fed two ways: event-driven flips (webhook 401s, revocations, sync failures) and periodic `HealthCapable.checkHealth` sweeps from the maintenance scheduler. |
| 8 | Credential Vault decoupled from Postgres (KMS/Azure KV/HashiCorp) | **Seam now** | `CredentialStore` port + `CredentialVault` service land now; the one shipped store is Postgres + versioned AES-256-GCM envelopes. KMS/Vault/ASM backends are pluggable behind the port later — building them now is speculative infra we can't even integration-test locally, and no requirement (SOC2 etc.) currently forces it. The application never touches storage directly — vault only — so swapping stores is config, not refactor. |
| 9 | Event bus (Redis Streams) between webhooks and workers | **Seam now** | This is the biggest trade-off call, argued in §5. We adopt the *architecture* — webhook processing publishes **provider-independent platform events**; consumers (sync dispatcher, SSE, health) subscribe to events, never to providers. We do not adopt Redis Streams as transport today: durable competing consumption already exists in this codebase as BullMQ (that's literally what it does), and a Streams layer would duplicate it (two offset/retry/DLQ systems) to serve consumers that don't exist yet (analytics, AI summaries). Transport v1 = existing Redis Pub/Sub (live fan-out) + BullMQ (durable dispatch), behind an `EventBus` port. When a second durable consumer class actually arrives, swap the port's impl to Streams with zero provider/app changes. |
| 10 | AI layer never knows providers exist | **Adopt (formalize)** | Retrieval is already provider-blind (Qdrant collections + source paths); we formalize it: providers emit normalized `KnowledgeItem`s through a `KnowledgeSink`; citation enrichment becomes a registry-resolved `CitationCapable` (deleting the hardcoded `SlackCitationEnricher` special case). New providers get a uniform `sourceRef` scheme (`<provider>/<account>/<resource>/<item>`); existing embedded payloads are grandfathered (re-embedding everything to rename paths buys nothing). |
| 11 | Org-scoped providers, project attachments | **Adopt** | Unchanged from v1 (`integrations` org-scoped; `knowledge_connectors` project-scoped with `integration_id`). |
| 12 | Provider-agnostic BYOA | **Adopt** | Unchanged from v1: `mode='byoa'` + `app_*` credential kinds + per-integration webhook URL; nothing GitHub-specific in the mechanism. |
| 13 | Sync modes incl. scheduled; conflict/idempotency in providers | **Adopt/Adapt** | A generic **SyncEngine** (worker) executes `SyncCapable.executeSync(ctx, sink)`; engine owns batching, purge-before-reingest, content-hash skip, cursor commits, progress, retries — providers own only "what to fetch and how it maps to items". Sync policy is data (`sync_policy` jsonb per connector: `event`/`manual`/`interval`) — interval scheduling later = rows + the existing scheduler, no architecture change. |
| 14 | No switch statements / no provider conditionals | **Adopt** | Registry lookup + capability guards. The lone string→impl mapping in the system is `Map.get(providerId)`. |
| 15 | Contract tests every provider must pass | **Adopt** | `providerContractTests(factory, fixtures)` in `@meshify/providers/testing`: descriptor/capability consistency, OAuth round-trip, webhook accept/tamper-reject + dedup stability, sync normalization + cursor honor, health mapping. GitHub and Slack run it from day one; it is the acceptance gate for every future provider. |
| 16 | DB `CHECK` constraints enumerate providers | **Adapt (remove)** | `integrations.provider`, `knowledge_connectors.type`, `pipeline_jobs.job_type` checks are replaced by app-layer registry validation — a new provider must not require a migration. Trade-off: we lose a DB-level typo guard; gained: true zero-touch extensibility. |
| 17 | Per-provider workers | **Reject (generalize)** | Provider-specific queues/processors (`repo-ingest`, `slack-sync`, …) are retired in favor of one `source-sync` queue + one generic processor that resolves the provider from the registry. Fewer moving parts at N providers, uniform dedup/backoff policy. `document-ingest` (local uploads) stays as-is this phase and is noted as a future `localfiles` provider. |

Everything else in the vNext brief (security additions, testing scope, documentation set, reporting cadence) is adopted as written.

## 1. Package layout

```
packages/providers/                  @meshify/providers — the platform core
  src/base/
    descriptor.ts        ProviderDescriptor, ProviderCapabilities, availability
    provider.ts          Provider, capability guards (supportsOAuth(p) etc.)
    oauth.ts             OAuthCapable, ConnectInput/CallbackInput/ConnectResult, CredentialRefresh
    webhook.ts           WebhookCapable, RawWebhookRequest, WebhookDescriptor
    sync.ts              SyncCapable, SyncContext, SyncMode, SyncSummary
    knowledge.ts         KnowledgeItem, KnowledgeSink, sourceRef helpers
    health.ts            HealthCapable, ProviderHealth (+ state union)
    citation.ts          CitationCapable, CitationDetail
    byoa.ts              ByoaCapable, ByoaConfigField (masked-input metadata for UI)
    errors.ts            typed provider errors (ProviderAuthError, ProviderRateLimitError, …)
  src/registry/provider-registry.ts
  src/vault/
    credential-store.port.ts   CredentialStore (get/put/delete/list by integration+kind)
    credential-vault.ts        CredentialVault (encryption-aware caching, refresh orchestration)
  src/events/
    platform-events.ts   PlatformEvent union (see §5) + EventBus port
    redis-event-bus.ts   Pub/Sub impl behind structural Redis interfaces (ioredis-free, mirrors queues/job-events)
  src/oauth/state-service.ts   OAuthStateService (single-use server-side state, port to data-access)
  src/common/archive/          extract/scan utilities shared by github + zip paths (moved from apps/worker/src/repo)
  src/github/                  descriptor, oauth, webhooks, sync, health, citation, deps
  src/slack/                   descriptor, oauth, webhooks, sync, health, citation, deps
  src/catalog/coming-soon.ts   descriptor-only entries (gitlab, bitbucket, azuredevops, teams, discord,
                               googledrive, onedrive, sharepoint, confluence, jira, linear, notion, …)
  src/testing/                 contract test kit + fakes
```

`@meshify/providers` depends on `@meshify/github`, `@meshify/slack` (transport SDKs) and nothing else
heavy; persistence stays behind ports satisfied **structurally** by `@meshify/data-access` classes
(TypeScript structural typing — no package-level dependency cycle; composition roots do the wiring).

## 2. Core contracts (shape, not full listing)

```ts
interface ProviderDescriptor {
  id: string;                            // 'github' — the only place the string exists
  displayName: string; category: 'code'|'chat'|'docs'|'tickets'|'storage'|'crm';
  availability: 'available'|'coming_soon';
  capabilities: ProviderCapabilities;    // oauth, webhooks, fullSync, incrementalSync, realtimeEvents,
                                         // manualSync, scheduledSync, resourcePicker, healthCheck, byoa, permissions
  iconKey: string; brandColor?: string; docsUrl?: string;
}

interface SyncCapable {
  executeSync(ctx: SyncContext, sink: KnowledgeSink): Promise<SyncSummary>;
}
interface SyncContext {
  mode: 'full'|'incremental'; integration: Integration; connector: KnowledgeConnector;
  project: ProjectRef; credentials: VaultHandle; cursors: CursorStore; signal?: AbortSignal;
}
interface KnowledgeSink {                 // the ONLY door into the knowledge layer
  upsert(items: KnowledgeItem[]): Promise<void>;   // engine: hash-skip, purge-before-reingest, batch, embed
  remove(sourceRefs: string[]): Promise<void>;
  progress(stage: string, percent?: number): void;
}
interface KnowledgeItem {
  sourceRef: string;                      // '<provider>/<account>/<resource>/<item>' for new providers
  target: 'documents'|'code';
  content: Buffer|string; mimeType?: string; title?: string;
  contentHash: string; metadata?: Record<string, unknown>;
}
```

The retrieval/chat layer consumes Qdrant + `CitationCapable` only — it has no provider imports.

## 3. Data model (v1 schema carried over + provider-platform columns)

Migrations `0011`–`0013` as in the Phase 2 doc, with these v2 amendments:

- `integrations` + `health text not null default 'unknown'`, `health_detail jsonb not null default '{}'`, `health_checked_at timestamptz`; **no CHECK on `provider`**.
- `knowledge_connectors` + `integration_id`, `sync_policy jsonb not null default '{"trigger":"event"}'`; the `type` CHECK is dropped (registry-validated).
- `pipeline_jobs`: `dedupe_key` + partial unique (queued-only) as designed; `job_type` CHECK dropped; new generic type value `source_sync` (legacy values remain valid history).
- New `sync_cursors (connector_id fk cascade, scope_key text, cursor jsonb, updated_at, unique(connector_id, scope_key))` — the generic cursor store for all future providers (delta tokens, page tokens, timestamps). GitHub (`last_synced_commit`) and Slack (`slack_sync_state`) keep their legacy stores behind the `CursorStore` port this phase (consolidation later; migrating live cursors buys nothing now).
- `integration_credentials`, `oauth_states`, `webhook_events`: unchanged from v1 (already provider-agnostic).

## 4. Request/flow architecture

```
Marketplace UI ──GET /v1/providers──────────────► ProviderRegistry (descriptors)
             ──POST /v1/integrations/:provider/connect─► OAuthCapable.buildConnectUrl + oauth_states
             ──POST /v1/integrations/:provider/callback► OAuthCapable.completeConnect → integrations + vault
             ──GET /v1/integrations/:id/resources──────► ResourceBrowsingCapable.listResources
Project attach ─POST /v1/projects/:id/connectors {integrationId, resources}─► connector rows + source-sync job

Provider ──POST /v1/integrations/webhooks/:provider[/:integrationId]──► receiver (raw body, registry→verifyWebhook)
   → webhook_events insert (unique delivery) → BullMQ webhook-events job
   → worker: WebhookCapable.normalizeWebhook → PlatformEvent[] → EventBus.publish
   → dispatcher consumer: events → source-sync enqueues (dedupe_key) / status+health flips
   → SSE consumers: org integrations stream + existing per-project jobs stream
```

The platform-api `integrations` module and the worker never mention a provider by name; the only
provider-aware code paths are inside `packages/providers/<id>/`.

## 5. Platform events (the provider-independent vocabulary)

```
resource.updated   {provider, integrationId, resourceType, externalResourceId, hint?}   // push, file edit
resource.removed   {…}                                                                  // repo/channel/file deleted
resource.renamed   {…, previousName}
activity.message   {provider, integrationId, channelRef}                                // chat activity → debounced sync
grant.changed      {provider, integrationId, added[], removed[]}                        // installation_repositories, permission changes
installation.revoked | installation.suspended {provider, integrationId}
integration.connected | integration.disconnected | integration.health_changed {…}
sync.requested     {connectorId, mode, reason: webhook|manual|scheduled|reconcile}
```

Webhook payload → `normalizeWebhook` → these events; **consumers subscribe to events**: the sync
dispatcher (durable, via BullMQ), the SSE hubs (live), health maintenance (live). Future consumers
(analytics, notifications, AI summaries) subscribe to the same bus port; upgrading the transport to
Redis Streams is an impl swap behind `EventBus` (decision #9).

## 6. Worker architecture

- **`source-sync` queue** (generic): payload `{pipelineJobId, connectorId, integrationId, projectId, mode}`; the processor resolves the provider via the registry, builds `SyncContext` (vault handle, cursor store, project pipeline info) and runs `executeSync` inside the existing `runPipelineJob` lifecycle + `JobProgress`. Job title carries the human context ("Syncing acme/api · GitHub").
- **`webhook-events` queue**: receiver-decoupling as in v1; processor calls `normalizeWebhook` + publishes events.
- **`integration-maintenance` scheduler** (BullMQ 5.80 Job Scheduler): credential refresh sweep (vault-driven, `refreshCredentials`), health sweep (`checkHealth`), staleness reconcile (`sync.requested{reason:'reconcile'}` for event-triggered connectors idle >24h), `webhook_events` retention, and — later, zero new architecture — `sync_policy.trigger='interval'` rows.
- Legacy `repo-ingest/repo-sync/slack-ingest/slack-sync` queues + processors are **retired at the end of the sync-engine milestone** (producers first, consumers after drain); their logic moves into `providers/github/sync.ts` and `providers/slack/sync.ts` behind `SyncCapable`. `document-ingest` untouched this phase.
- Engine-level correctness upgrades ride along exactly as in v1: purge-before-reingest (fixes the stale-vector bug), deterministic `dedupe_key`, shared DB-cached installation tokens.

## 7. Security model

Everything from the Phase 2 §9 security model carries over verbatim (raw-body timing-safe webhook
verification before any work, state-bound installation claiming, org-scoped isolation with 404
semantics, least-privilege scopes, no secrets in DTOs/logs/frontend, BFF-only browser path), plus:

- **Key versioning** (`v1.` envelope prefix) + `INTEGRATION_ENCRYPTION_KEY` decoupling — now implemented inside the vault's Postgres store, invisible to callers.
- **Provider isolation**: a provider module receives only its own deps + vault handle scoped to the integration being operated on; no provider can read another provider's credential kinds (vault enforces `integration_id` scoping by construction).
- **Secret rotation**: vault `rotate(kind)` + BYOA re-submission both write new versions; `rotated_at` audit trail; managed-app env rotation documented in ops runbook.
- **Audit**: existing `auditLogMiddleware` covers all new mutating routes automatically; `webhook_events` is the inbound ledger.

## 8. Frontend

- **Marketplace** (`/projects/:id/integrations`): catalog grid from `GET /v1/providers` merged with org integration state — Available → Connect/Manage; Coming Soon → badge. Cards show health pill, account, resource counts, last sync.
- **Provider detail panel**: capability-driven — Connect/Reconnect/Disconnect (oauth), resource picker (resourcePicker), Sync now (manualSync), health + last webhook (webhooks/healthCheck), BYOA config (byoa; write-only masked fields from `ByoaConfigField` metadata).
- **Generic OAuth return**: `/oauth/:provider/callback` + one `OAuthCallbackPage` (server resolves everything from state; `/oauth/slack/callback` kept as an alias until in-flight states drain).
- Live updates: org integrations SSE + existing jobs SSE; `PRESENTATION` gains one generic `source_sync` entry.
- Repositories/Slack pages become resource views backed by connectors; their bespoke connect flows delegate to the marketplace.

## 9. Testing strategy

- **Contract kit** (`@meshify/providers/testing`): every provider must pass `providerContractTests` — descriptor validity; capability↔implementation consistency; OAuth connect/callback round-trip incl. state misuse; webhook verify accept + tamper/replay reject + `describeWebhook` dedup stability; `normalizeWebhook` maps fixtures to platform events; `executeSync` emits normalized items, honors cursors, is re-run-safe; health maps auth failure → `token_expired`/`needs_reauthorization`.
- **Fakes**: `FakeSlackClient` (exists) + new `FakeGitHubTransport`; fake `CredentialStore`, `CursorStore`, `KnowledgeSink`, `EventBus` in the kit.
- **Unit**: vault (envelope versioning, legacy decrypt, refresh), registry, state service, receivers (signature e2e incl. raw-body ordering regression test), dispatcher, engine (purge/hash-skip/dedupe), use cases per module (existing repo pattern).
- **Integration/e2e**: webhook→event→job flow with recorded provider payloads; migration backfill test.

## 10. Documentation set (committed with the work)

`docs/architecture/provider-platform.md` (this design, maintained), `docs/backend/providers.md`
(runtime: registry, vault, events, engine), `docs/backend/webhooks.md`, updated `connectors.md`,
`data-model.md`, `environment-variables.md`, ops runbook (app setup, tunnels, rotation), and
`docs/contributing/adding-a-provider.md` — the extension guide (interface checklist, contract tests,
descriptor/catalog entry, "UI comes free").

## 11. Milestones (branch `feature/provider-platform`)

| # | Milestone | Contents |
|---|---|---|
| M0 | Branch + design docs | this doc + phase docs committed |
| M1 | Schema + data-access | 0011–0013 (+v2 columns), entities/repos, versioned envelope encryption, Slack→integrations backfill, tests |
| M2 | Platform core | base contracts, registry, vault, events/bus, state service, contract-test kit; **GitHub + Slack providers**: descriptor/oauth/webhook/health/citation (+ coming-soon catalog) |
| M3 | platform-api | providers catalog + integrations module (connect/callback/resources/disconnect/reconnect via registry), org SSE stream, slack module rewired to provider, repositories picker connect |
| M4 | Sync engine | `source-sync` queue + generic processor, `KnowledgeSink`, provider sync implementations (logic moved from worker), purge-before-reingest, dedupe keys, legacy queue retirement |
| M5 | Webhooks + events | receivers (managed + BYOA paths), `webhook-events` queue, normalizeWebhook, EventBus + dispatcher, health flips |
| M6 | Maintenance + health | scheduler: refresh/health/reconcile/retention; health surfacing end-to-end |
| M7 | Frontend | marketplace, detail panels, generic callback, repo/channel pickers, SSE client |
| M8 | BYOA | config endpoint + vault kinds + per-integration webhook URL + UI |
| M9 | Cleanup + docs + hardening | dead config, stale comments/READMEs, handbook set, extension guide, test sweep, `.env.example`, k8s notes |

Reporting after every milestone per the agreed template; stop-and-ask on any decision that changes
this document materially.

## 12. v2.1 addendum — engine, canonical model, event domains, manifests, tools

Five extensions requested after the M2 review, all landing in the platform core before M3 consumes
its shapes:

1. **Connector Engine** (`src/engine/`) — sits between providers and the knowledge layer. Providers
   never receive the raw sink anymore: the engine hands them an engine-owned `KnowledgeSink`, and
   behind it owns content-hash skip (via a `ContentLedger` port), purge-before-reingest ordering,
   batching, scope-failure aggregation, and the `SyncSummary`. Below the engine sits a
   `KnowledgeWriter` port (embed/delete) implemented in the worker over RocketRide+Qdrant.
   Layering: `Provider → engine sink → ConnectorEngine → KnowledgeWriter → vectors`.
   `SyncCapable.executeSync` now returns `void` — the engine, not the provider, owns the summary.
2. **Canonical Resource Model** (`src/base/canonical.ts`) — one hierarchy every provider maps into:
   **Account** (the org-level grant: GitHub org/user, Slack team) → **Workspace** (container tier:
   Slack workspace, SharePoint site; collapses to the account for flat providers like GitHub) →
   **Resource** (repository, channel, drive) → **Connector** (a project's binding of a resource) →
   **Knowledge** (normalized items). Canonical `sourceRef` scheme:
   `<provider>/<account>/<workspace>/<resource>/<item-path>` (workspace = account when the provider
   has no workspace tier); legacy GitHub file paths and `slack/...` refs stay grandfathered. The new
   `integration_resources` table (migration 0013) caches each grant's resource inventory —
   pickers read it, `permission.changed` events maintain it, connectors validate against it.
3. **Event domains** — the platform event taxonomy is organized into six domains:
   **connection.**(established/revoked/suspended/disconnected), **resource.**(updated/removed/renamed/discovered),
   **content.**(changed — knowledge-bearing activity inside a resource), **permission.**(changed),
   **health.**(changed), **sync.**(requested/completed/failed). `eventDomain(kind)` gives consumers
   domain-level subscription granularity.
4. **Provider Manifest** — `ProviderDescriptor` grew into `ProviderManifest`: `manifestVersion`
   (the platform contract version; the registry rejects manifests outside its supported range),
   `providerVersion` (semver of the implementation), `auth` (type + scopes, machine-readable),
   `webhookEvents` (consumed event types), and `toolNames`. Providers are self-describing: the
   marketplace, docs, and future remote-provider loading all read the manifest, and a provider can
   be upgraded independently of the platform as long as its manifestVersion is supported.
5. **Tools** (`src/base/tools.ts`) — a provider can expose **Tools** alongside Knowledge Sources:
   `ToolCapable.listTools()` returns JSON-Schema tool definitions and `executeTool(name, args, ctx)`
   runs one with the integration-scoped vault context. This maps 1:1 onto MCP (`tools/list` ⇒
   registry×listTools, `tools/call` ⇒ executeTool), so a future Meshify MCP server is a thin
   adapter over the registry — no provider changes. GitHub/Slack declare `tools: false` until a
   tools milestone ships real ones (flags stay honest).
