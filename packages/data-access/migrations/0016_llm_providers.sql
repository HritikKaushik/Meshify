-- AI Providers — a first-class subsystem parallel to (and independent of) the
-- knowledge-source Integrations platform. These tables answer "which model runs
-- inference", not "where does knowledge come from", and share no lifecycle with
-- integrations (no OAuth, webhooks, sync, or project attachment).
--
-- Design mirrors the Integrations platform's conventions:
--   * Org-scoped configuration; secrets never live here — they go through the
--     existing Credentials Vault (versioned AES-256-GCM), never duplicated.
--   * Provider ids are NOT CHECK-constrained (validated by the @meshify/ai
--     registry) so adding a provider never requires a migration.
--   * Exactly one provider is active per organization.

-- The org's configuration for a single provider (OpenAI, Anthropic, …).
create table llm_provider_configurations (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references organizations (id) on delete cascade,
	provider text not null,
	status text not null default 'disconnected' check (status in ('connected', 'error', 'disconnected')),
	-- The model RocketRide should run for this provider (e.g. "gpt-4.1", a
	-- deployment name). Null until the org picks one.
	default_model text,
	-- Non-secret config: base_url, endpoint, api_version, deployment, server_url…
	-- Secrets live in llm_provider_credentials; never duplicated here.
	config jsonb not null default '{}',
	metadata jsonb not null default '{}',
	last_error text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (org_id, provider)
);

create index idx_llm_provider_configurations_org on llm_provider_configurations (org_id);

-- Encrypted per-provider secrets (api_key, …), versioned AES-256-GCM envelopes
-- via the same CredentialVault the Integrations platform uses. Keyed by the
-- configuration id, which structurally satisfies the vault's CredentialStore port.
create table llm_provider_credentials (
	id uuid primary key default gen_random_uuid(),
	configuration_id uuid not null references llm_provider_configurations (id) on delete cascade,
	kind text not null,
	encrypted_value text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (configuration_id, kind)
);

-- Exactly one active provider per organization — enforced by org_id being the
-- primary key. Activating upserts this single row; deleting the active
-- configuration cascades this row away, so disconnect clears "active" for free.
create table active_llm_providers (
	org_id uuid primary key references organizations (id) on delete cascade,
	configuration_id uuid not null references llm_provider_configurations (id) on delete cascade,
	updated_at timestamptz not null default now()
);

create index idx_active_llm_providers_configuration on active_llm_providers (configuration_id);
