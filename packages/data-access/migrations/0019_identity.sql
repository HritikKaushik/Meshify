-- Identity foundation: real people, org memberships, per-project memberships.
--
-- Until now no person existed in Postgres. Every browser session in an org
-- authenticates with the same shared org API key, the Clerk user id travelled
-- to platform-api only as a rate-limit bucket key, and "role" was a Clerk
-- admin/member flag forwarded in a header. Any org member could read and mutate
-- every project in the org, and audit_logs could not say who did anything.
--
-- This migration is ADDITIVE for running code: platform-api deploys first and
-- runs it while the previous BFF/worker/web are still live, so every change
-- below keeps the old INSERT column lists valid (new columns are nullable or
-- defaulted; chats.user_id and audit_logs.actor_id keep their names).
-- See docs/product/ai-pm-roadmap.md, Phase 1.

-- 1. users ---------------------------------------------------------------
-- The 0001 `users` table is dead: no repository, no reader, no writer, and its
-- `email` UNIQUE is global, so one address could never belong to two orgs.
-- It only exists as the FK target of chats.user_id and audit_logs.actor_id,
-- both always NULL. Refuse to run if that ever stopped being true rather than
-- silently discarding data, then replace it with a global identity table keyed
-- by the Clerk user id (org membership is a separate row, below).
do $$
begin
	if exists (select 1 from users)
		or exists (select 1 from chats where user_id is not null)
		or exists (select 1 from audit_logs where actor_id is not null) then
		raise exception 'legacy users table is not empty - migrate its rows by hand before applying 0019';
	end if;
end $$;

alter table chats drop constraint chats_user_id_fkey;
alter table audit_logs drop constraint audit_logs_actor_id_fkey;
-- No CASCADE: an unexpected dependent object should fail loudly here.
drop table users;

create table users (
	id uuid primary key default gen_random_uuid(),
	-- The only upsert key. Clerk owns authentication; this row is Meshify's
	-- stable, FK-able handle for that identity.
	clerk_user_id text not null unique,
	-- Display only. NOT unique: addresses change and get recycled, and the same
	-- person may appear under several over time.
	email text,
	display_name text,
	avatar_url text,
	last_seen_at timestamptz,
	-- Set when Clerk reports the user deleted; PII above is scrubbed at the same
	-- time. The row stays so attribution FKs keep pointing at "a former member".
	deactivated_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index idx_users_email on users (lower(email));

-- chats.user_id was ON DELETE CASCADE: removing a person would have deleted
-- conversations the whole project shares. Attribution must never own the row.
alter table chats
	add constraint chats_user_id_fkey foreign key (user_id) references users (id) on delete set null;
alter table audit_logs
	add constraint audit_logs_actor_id_fkey foreign key (actor_id) references users (id) on delete set null;

create index idx_chats_user_id on chats (project_id, user_id);

-- 2. org memberships -----------------------------------------------------
-- role_key is a closed set here because org roles are structural (ownership,
-- billing). "At least one active owner" cannot be declared in SQL; the
-- repository enforces it under a row lock on the organization.
create table org_memberships (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references organizations (id) on delete cascade,
	user_id uuid not null references users (id) on delete cascade,
	role_key text not null default 'member' check (role_key in ('owner', 'admin', 'member')),
	status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
	clerk_membership_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	removed_at timestamptz,
	unique (org_id, user_id)
);

create index idx_org_memberships_user_id on org_memberships (user_id);

-- 3. project memberships -------------------------------------------------
-- The composite FKs make a cross-org grant impossible at the database level:
-- the project must belong to org_id, and the user must be a member of that
-- same org_id. Removing someone from the org cascades their project grants.
alter table projects add constraint projects_id_org_id_key unique (id, org_id);

create table project_memberships (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null,
	project_id uuid not null,
	user_id uuid not null,
	-- Format-checked, not enum-checked: the built-in project roles live in the
	-- code-defined catalog (@meshify/authz), so adding one needs no migration,
	-- and org-defined custom roles can arrive later without reshaping this table.
	role_key text not null check (role_key ~ '^[a-z][a-z0-9_]{1,39}$'),
	added_by_user_id uuid references users (id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (project_id, user_id),
	foreign key (project_id, org_id) references projects (id, org_id) on delete cascade,
	foreign key (org_id, user_id) references org_memberships (org_id, user_id) on delete cascade
);

create index idx_project_memberships_user on project_memberships (org_id, user_id);

-- 4. legacy-project safety valve -----------------------------------------
-- A non-null default_member_role_key means "every active org member without an
-- explicit project_memberships row holds this role here". Every project that
-- exists today was open to the whole org, so it stays open (as developer) and
-- nobody is locked out the day enforcement turns on; an admin makes it private
-- by clearing the column once explicit members are in place. Projects created
-- from now on default to NULL, i.e. private to their members.
alter table projects
	add column default_member_role_key text check (default_member_role_key is null or default_member_role_key ~ '^[a-z][a-z0-9_]{1,39}$'),
	add column created_by_user_id uuid references users (id) on delete set null;

update projects set default_member_role_key = 'developer';

-- 5. API key kinds -------------------------------------------------------
-- 'bff' keys are the per-org keys the BFF holds on behalf of signed-in people:
-- authority for those requests comes from the person's memberships. 'service'
-- keys are machine credentials whose authority is their scopes.
alter table api_keys
	add column kind text not null default 'service' check (kind in ('service', 'bff')),
	add column created_by_user_id uuid references users (id) on delete set null;

update api_keys set kind = 'bff' where id in (select api_key_id from clerk_org_links);

-- 6. attribution ---------------------------------------------------------
-- Who did it. All nullable with ON DELETE SET NULL and no backfill: history
-- before this migration genuinely has no known actor.
alter table messages
	add column author_user_id uuid references users (id) on delete set null,
	-- Calibrated retrieval confidence (see calibrateConfidence). It was computed
	-- every turn and then discarded, so a reloaded conversation showed none. The
	-- CHECK keeps a raw cosine or a percentage from ever being stored here.
	add column confidence real check (confidence is null or (confidence >= 0 and confidence <= 1));

alter table documents add column uploaded_by_user_id uuid references users (id) on delete set null;
alter table repositories add column connected_by_user_id uuid references users (id) on delete set null;
alter table knowledge_connectors add column created_by_user_id uuid references users (id) on delete set null;
alter table integrations add column connected_by_user_id uuid references users (id) on delete set null;
alter table oauth_states add column created_by_user_id uuid references users (id) on delete set null;
alter table pipeline_jobs add column triggered_by_user_id uuid references users (id) on delete set null;

-- 7. audit ---------------------------------------------------------------
-- actor_type says what kind of principal acted; category separates the generic
-- HTTP mutation log from explicit domain events (role changes, membership
-- changes) that are written in the same transaction as the change itself.
alter table audit_logs
	add column actor_type text check (actor_type is null or actor_type in ('user', 'service', 'system')),
	add column category text not null default 'http' check (category in ('http', 'domain'));

-- "What happened in this org, newest first" and "what did this person do".
-- The composite supersedes the single-column org_id index from 0001.
create index idx_audit_logs_org_created on audit_logs (org_id, created_at desc);
create index idx_audit_logs_actor_id on audit_logs (actor_id);
drop index if exists idx_audit_logs_org_id;
