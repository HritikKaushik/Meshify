-- Provider Platform core: org-scoped integrations, encrypted credentials,
-- server-side OAuth state, webhook receipt ledger, and generic sync cursors.
--
-- `integrations` is the org-level authorization of a provider (a GitHub App
-- installation, a Slack workspace install, a future SharePoint site consent).
-- Project-level attachment stays on `knowledge_connectors` (linked in 0012).
--
-- Provider ids and credential kinds are deliberately NOT constrained by CHECKs:
-- they are validated by the application-side ProviderRegistry so that adding a
-- new provider never requires a migration. Platform-owned vocabularies that do
-- not grow with providers (mode, status, intent, webhook status) stay CHECKed.

-- --- Org-scoped integrations ------------------------------------------------

create table integrations (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references organizations (id) on delete cascade,
	provider text not null,
	mode text not null default 'managed' check (mode in ('managed', 'byoa')),
	-- The provider's natural id for this grant: GitHub App installation id,
	-- Slack team id, SharePoint tenant id, ... Uniform key for webhook routing.
	external_account_id text not null,
	external_account_name text not null default '',
	status text not null default 'pending' check (status in ('pending', 'active', 'error', 'revoked', 'disconnected')),
	-- Health vocabulary evolves with the platform (healthy, syncing, token_expired,
	-- permission_changed, webhook_broken, needs_reauthorization, partially_connected,
	-- disconnected, unknown) — app-validated, unconstrained here.
	health text not null default 'unknown',
	health_detail jsonb not null default '{}',
	health_checked_at timestamptz,
	metadata jsonb not null default '{}',
	last_error text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index idx_integrations_org_provider_account on integrations (org_id, provider, external_account_id);
create index idx_integrations_org on integrations (org_id);
create index idx_integrations_provider_account on integrations (provider, external_account_id);

-- --- Encrypted credentials (one row per kind) -------------------------------

-- Kinds are provider-defined (access_token, refresh_token, installation_token,
-- webhook_secret, app_private_key, app_client_secret, app_signing_secret, ...).
-- `encrypted_value` is a versioned AES-256-GCM envelope ("v1.iv.tag.ct");
-- pre-versioning "iv.tag.ct" envelopes remain decryptable.
create table integration_credentials (
	id uuid primary key default gen_random_uuid(),
	integration_id uuid not null references integrations (id) on delete cascade,
	kind text not null,
	encrypted_value text not null,
	expires_at timestamptz,
	rotated_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index idx_integration_credentials_integration_kind on integration_credentials (integration_id, kind);
create index idx_integration_credentials_expiring on integration_credentials (expires_at) where expires_at is not null;

-- --- Server-side OAuth state (single-use, org-bound) ------------------------

-- Only the HMAC hash of the state token is stored; the token itself travels in
-- the provider redirect and is never persisted. Consumption is atomic
-- (update ... where consumed_at is null), closing replay windows.
create table oauth_states (
	id uuid primary key default gen_random_uuid(),
	state_hash text not null,
	org_id uuid not null references organizations (id) on delete cascade,
	provider text not null,
	project_id uuid references projects (id) on delete cascade,
	intent text not null default 'connect' check (intent in ('connect', 'reconnect')),
	integration_id uuid references integrations (id) on delete cascade,
	return_path text,
	created_by_key_id uuid,
	expires_at timestamptz not null,
	consumed_at timestamptz,
	created_at timestamptz not null default now()
);

create unique index idx_oauth_states_hash on oauth_states (state_hash);
create index idx_oauth_states_expiry on oauth_states (expires_at);

-- --- Inbound webhook ledger -------------------------------------------------

-- Every verified delivery is recorded before processing; the unique
-- (provider, delivery_id) makes provider redeliveries idempotent no-ops.
create table webhook_events (
	id uuid primary key default gen_random_uuid(),
	provider text not null,
	delivery_id text not null,
	event_type text not null,
	integration_id uuid references integrations (id) on delete set null,
	payload jsonb not null,
	status text not null default 'received' check (status in ('received', 'queued', 'processed', 'skipped', 'failed')),
	error text,
	received_at timestamptz not null default now(),
	processed_at timestamptz
);

create unique index idx_webhook_events_provider_delivery on webhook_events (provider, delivery_id);
create index idx_webhook_events_integration on webhook_events (integration_id);
create index idx_webhook_events_pending on webhook_events (status) where status in ('received', 'queued');

-- --- Generic sync cursors ---------------------------------------------------

-- Incremental-sync position per connector scope (a channel, a drive, a delta
-- link). GitHub (`repositories.last_synced_commit`) and Slack
-- (`slack_sync_state`) keep their legacy stores behind the CursorStore port;
-- new providers use this table from day one.
create table sync_cursors (
	id uuid primary key default gen_random_uuid(),
	connector_id uuid not null references knowledge_connectors (id) on delete cascade,
	scope_key text not null,
	cursor jsonb not null default '{}',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index idx_sync_cursors_connector_scope on sync_cursors (connector_id, scope_key);
