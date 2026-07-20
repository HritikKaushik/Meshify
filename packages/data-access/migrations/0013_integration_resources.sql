-- Canonical resource inventory: a cache of every resource each org-level
-- integration grants access to (repositories of an installation, channels of a
-- workspace, sites of a tenant). Pickers read it, permission.changed events
-- maintain it, and connectors validate against it. Rows are soft-removed
-- (removed_at) so a revoked-then-restored grant keeps history.

create table integration_resources (
	id uuid primary key default gen_random_uuid(),
	integration_id uuid not null references integrations (id) on delete cascade,
	-- Canonical tiers: workspace collapses to the account for flat providers.
	workspace_id text,
	resource_id text not null,
	kind text not null,
	name text not null,
	private boolean not null default false,
	metadata jsonb not null default '{}',
	discovered_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	removed_at timestamptz
);

create unique index idx_integration_resources_integration_resource on integration_resources (integration_id, resource_id);
create index idx_integration_resources_integration on integration_resources (integration_id) where removed_at is null;
