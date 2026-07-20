-- Organization Provider Registration — the layer that owns application-level
-- provider credentials, resolving the OAuth circular dependency (credentials
-- must exist before an Integration does).
--
--   Organization → Provider Registration → Integration → Resources
--
-- A registration is the org's application registration for a provider (GitHub
-- App, Slack app, Azure AD app, …): app id, client id, redirect uri, webhook
-- ownership, and a mode. Only BYOA registrations are stored here — every org
-- has a VIRTUAL "managed" registration resolved from the deployment's env, so
-- existing managed integrations need no backfill (registration_id stays null).
--
-- Split of ownership:
--   Provider Registration — app credentials, OAuth config, redirect URIs,
--                           webhook secret, provider mode
--   Integration          — installation/workspace id, access/refresh tokens,
--                           health, resources, sync state (runtime only)

create table provider_registrations (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references organizations (id) on delete cascade,
	provider text not null,
	-- Real rows are always BYOA; managed is the virtual default (no row).
	mode text not null default 'byoa' check (mode in ('byoa')),
	-- Non-secret app config (app_id, app_slug, app_client_id, app_redirect_uri,
	-- tenant_id, …). Secrets live in provider_registration_credentials.
	config jsonb not null default '{}',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (org_id, provider)
);

create index idx_provider_registrations_org on provider_registrations (org_id);

-- App-level secrets (app_private_key, app_client_secret, app_signing_secret,
-- app_webhook_secret, …), versioned AES-256-GCM envelopes via the vault.
create table provider_registration_credentials (
	id uuid primary key default gen_random_uuid(),
	registration_id uuid not null references provider_registrations (id) on delete cascade,
	kind text not null,
	encrypted_value text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (registration_id, kind)
);

-- An Integration now references the registration it was connected through.
-- Null = the virtual managed registration (the default, backwards-compatible).
alter table integrations add column registration_id uuid references provider_registrations (id) on delete set null;
create index idx_integrations_registration on integrations (registration_id);
