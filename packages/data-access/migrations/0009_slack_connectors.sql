-- Generic Connector Framework + Slack (first new consumer).
--
-- Introduces `knowledge_connectors` as the single aggregate every knowledge
-- source is modeled as, re-bases the existing GitHub and Documents paths onto it
-- (backfilling connector rows for all current repositories/documents), and adds
-- the Slack detail tables. Slack vectors live in the project's existing
-- `_documents` Qdrant collection, distinguished by a `slack/...` source_path.

-- --- Generic connector aggregate -------------------------------------------

create table knowledge_connectors (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references projects (id) on delete cascade,
	type text not null check (type in ('github', 'documents', 'slack')),
	display_name text not null,
	status text not null default 'connecting' check (status in ('connecting', 'active', 'error', 'disconnected')),
	config jsonb not null default '{}',
	last_error text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index idx_knowledge_connectors_project_id on knowledge_connectors (project_id);

-- --- Re-base existing sources onto connectors ------------------------------

alter table repositories add column connector_id uuid references knowledge_connectors (id) on delete cascade;
alter table documents add column connector_id uuid references knowledge_connectors (id) on delete cascade;

-- One `github` connector per existing repository. The source repository id is
-- stashed in config so the follow-up UPDATE can link them deterministically
-- (INSERT ... SELECT ... RETURNING cannot otherwise carry the source row id).
insert into knowledge_connectors (project_id, type, display_name, status, config)
select r.project_id,
       'github',
       coalesce(r.remote_url, 'Uploaded archive'),
       case r.sync_status when 'synced' then 'active' when 'failed' then 'error' else 'connecting' end,
       jsonb_build_object('repositoryId', r.id::text, 'source', r.source)
from repositories r;

update repositories r
set connector_id = c.id
from knowledge_connectors c
where c.type = 'github' and c.config->>'repositoryId' = r.id::text;

-- One singleton `documents` connector per project that has any documents.
insert into knowledge_connectors (project_id, type, display_name, status)
select distinct d.project_id, 'documents', 'Uploaded documents', 'active'
from documents d;

update documents d
set connector_id = c.id
from knowledge_connectors c
where c.type = 'documents' and c.project_id = d.project_id;

-- --- Slack detail tables ---------------------------------------------------

create table slack_workspaces (
	id uuid primary key default gen_random_uuid(),
	connector_id uuid not null references knowledge_connectors (id) on delete cascade,
	project_id uuid not null references projects (id) on delete cascade,
	team_id text not null,
	team_name text,
	bot_user_id text,
	scope text,
	encrypted_access_token text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index idx_slack_workspaces_connector on slack_workspaces (connector_id);
create unique index idx_slack_workspaces_project_team on slack_workspaces (project_id, team_id);

create table slack_channels (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references slack_workspaces (id) on delete cascade,
	project_id uuid not null references projects (id) on delete cascade,
	channel_id text not null,
	name text,
	is_private boolean not null default false,
	selected boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index idx_slack_channels_workspace_channel on slack_channels (workspace_id, channel_id);
create index idx_slack_channels_project_id on slack_channels (project_id);

create table slack_conversations (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references projects (id) on delete cascade,
	workspace_id uuid not null references slack_workspaces (id) on delete cascade,
	slack_channel_id uuid not null references slack_channels (id) on delete cascade,
	channel_id text not null,
	channel_name text,
	conversation_key text not null,
	source_path text not null,
	thread_ts text,
	ts_start text,
	ts_end text,
	permalink text,
	participants jsonb not null default '[]',
	message_count integer not null default 0,
	reaction_count integer not null default 0,
	visibility text not null default 'public' check (visibility in ('public', 'private')),
	content_hash text not null,
	status text not null default 'pending' check (status in ('pending', 'embedded', 'failed', 'deleted')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index idx_slack_conversations_project_key on slack_conversations (project_id, conversation_key);
create index idx_slack_conversations_project_id on slack_conversations (project_id);
create index idx_slack_conversations_source_path on slack_conversations (source_path);
create index idx_slack_conversations_content_hash on slack_conversations (content_hash);

create table slack_sync_state (
	id uuid primary key default gen_random_uuid(),
	slack_channel_id uuid not null references slack_channels (id) on delete cascade,
	project_id uuid not null references projects (id) on delete cascade,
	last_synced_ts text,
	last_synced_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index idx_slack_sync_state_channel on slack_sync_state (slack_channel_id);

-- --- Widen pipeline_jobs job types for Slack ingest/sync -------------------

alter table pipeline_jobs drop constraint pipeline_jobs_job_type_check;
alter table pipeline_jobs add constraint pipeline_jobs_job_type_check
	check (job_type in ('ingest_document', 'clone_repo', 'sync_repo', 'reindex', 'cleanup', 'slack_ingest', 'slack_sync'));
