-- Maps a Clerk organization to its auto-provisioned Meshify org + API key, so
-- the web BFF can resolve a Clerk session to a Meshify org/key without an
-- operator running the issue-api-key CLI by hand for every new sign-up.
-- The plaintext key is encrypted at rest (AES-256-GCM, key from
-- ORG_KEY_ENCRYPTION_KEY) since the BFF must present the plaintext as the
-- Authorization: Bearer value on every proxied request.

create table clerk_org_links (
	id uuid primary key default gen_random_uuid(),
	clerk_org_id text not null unique,
	org_id uuid not null references organizations (id) on delete cascade,
	api_key_id uuid not null references api_keys (id) on delete cascade,
	encrypted_secret text not null,
	created_at timestamptz not null default now()
);

create index idx_clerk_org_links_clerk_org_id on clerk_org_links (clerk_org_id);
