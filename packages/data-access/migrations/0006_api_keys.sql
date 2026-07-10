-- Security hardening (Step 9). API-key authentication scoped to an
-- organization. Keys are presented as `msk_<random>` and NEVER stored in the
-- clear: key_hash is HMAC-SHA256(PLATFORM_API_KEY_PEPPER, plaintext), so a
-- database leak alone cannot verify or reconstruct a key without the pepper.
-- Lookup is a single indexed probe on key_hash.

create table api_keys (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references organizations (id) on delete cascade,
	name text not null,
	-- Non-secret leading fragment (e.g. `msk_a1b2c3d4`) shown in listings/logs
	-- so an operator can identify a key without exposing the secret.
	key_prefix text not null,
	-- HMAC-SHA256(pepper, plaintext), base64. Unique so the auth lookup can use it.
	key_hash text not null unique,
	scopes text[] not null default '{}',
	last_used_at timestamptz,
	expires_at timestamptz,
	revoked_at timestamptz,
	created_at timestamptz not null default now()
);

create index idx_api_keys_org_id on api_keys (org_id);

-- Auth in Phase I is machine-to-machine via API keys, not end users, so the
-- audit actor is a key. audit_logs.actor_id (FK users) stays for Phase II human
-- actors; this records which key acted. set null on key deletion preserves history.
alter table audit_logs
	add column actor_key_id uuid references api_keys (id) on delete set null;

create index idx_audit_logs_actor_key_id on audit_logs (actor_key_id);

