-- Meshify AI Platform — initial schema
-- No document content or vectors live here — only pointers into Object
-- Storage and Qdrant. See ai-platform-architecture.md §4/§5 for rationale.

create extension if not exists pgcrypto;

create table organizations (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	plan text not null default 'free',
	created_at timestamptz not null default now()
);

create table users (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references organizations (id) on delete cascade,
	email text not null unique,
	role text not null default 'member',
	created_at timestamptz not null default now()
);

create table projects (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references organizations (id) on delete cascade,
	name text not null,
	description text,
	status text not null default 'active' check (status in ('active', 'archived')),
	llm_profile text not null default 'openai-5',
	embedding_profile text not null default 'openai-embed-3',
	qdrant_collection_docs text not null unique,
	qdrant_collection_code text not null unique,
	rocketride_ingest_pipeline_id uuid not null,
	rocketride_chat_pipeline_id uuid not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	deleted_at timestamptz
);

create index idx_projects_org_id on projects (org_id);

create table repositories (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references projects (id) on delete cascade,
	source text not null check (source in ('github', 'zip')),
	remote_url text,
	default_branch text,
	last_synced_commit text,
	sync_status text not null default 'pending' check (sync_status in ('pending', 'cloning', 'synced', 'failed')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index idx_repositories_project_id on repositories (project_id);

create table files (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references projects (id) on delete cascade,
	repository_id uuid references repositories (id) on delete cascade,
	path text not null,
	language text,
	size_bytes integer not null default 0,
	content_hash text not null,
	object_storage_key text not null,
	status text not null default 'pending' check (status in ('pending', 'parsed', 'embedded', 'failed')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index idx_files_project_id on files (project_id);
create index idx_files_content_hash on files (content_hash);

create table documents (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references projects (id) on delete cascade,
	source_type text not null check (source_type in ('pdf', 'docx', 'pptx', 'txt', 'md', 'readme')),
	filename text not null,
	object_storage_key text not null,
	content_hash text not null,
	status text not null default 'pending' check (status in ('pending', 'parsed', 'embedded', 'failed')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index idx_documents_project_id on documents (project_id);
create index idx_documents_content_hash on documents (content_hash);

create table chunks (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references projects (id) on delete cascade,
	parent_type text not null check (parent_type in ('document', 'file')),
	parent_id uuid not null,
	chunk_index integer not null,
	char_start integer not null,
	char_end integer not null,
	qdrant_point_id uuid not null,
	embedding_model text not null,
	embedding_version integer not null default 1,
	created_at timestamptz not null default now()
);

create index idx_chunks_project_id on chunks (project_id);
create index idx_chunks_parent on chunks (parent_type, parent_id);

create table chats (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references projects (id) on delete cascade,
	user_id uuid not null references users (id) on delete cascade,
	title text,
	created_at timestamptz not null default now()
);

create index idx_chats_project_id on chats (project_id);

create table messages (
	id uuid primary key default gen_random_uuid(),
	chat_id uuid not null references chats (id) on delete cascade,
	role text not null check (role in ('user', 'assistant', 'system')),
	content text not null,
	citations jsonb not null default '[]',
	latency_ms integer,
	model_used text,
	tokens_used integer,
	created_at timestamptz not null default now()
);

create index idx_messages_chat_id on messages (chat_id);

create table pipeline_jobs (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references projects (id) on delete cascade,
	job_type text not null check (
		job_type in ('ingest_document', 'clone_repo', 'sync_repo', 'reindex', 'cleanup')
	),
	status text not null default 'queued' check (
		status in ('queued', 'running', 'completed', 'failed', 'dead_letter')
	),
	rocketride_token text,
	attempts integer not null default 0,
	last_error text,
	payload jsonb not null default '{}',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	completed_at timestamptz
);

create index idx_pipeline_jobs_project_id on pipeline_jobs (project_id);
create index idx_pipeline_jobs_active on pipeline_jobs (status) where status in ('queued', 'running');

create table audit_logs (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references organizations (id) on delete cascade,
	project_id uuid references projects (id) on delete set null,
	actor_id uuid references users (id) on delete set null,
	action text not null,
	resource_type text not null,
	resource_id text not null,
	ip_address inet,
	metadata jsonb not null default '{}',
	created_at timestamptz not null default now()
);

create index idx_audit_logs_org_id on audit_logs (org_id);
create index idx_audit_logs_project_id on audit_logs (project_id);

-- Observability sink, populated by the DAP event ingester (see §9/§10).
create table pipeline_runs (
	id uuid primary key default gen_random_uuid(),
	project_id text not null,
	source text not null,
	state integer not null default 0,
	token text,
	started_at timestamptz,
	ended_at timestamptz
);

create index idx_pipeline_runs_project_source on pipeline_runs (project_id, source);

create table pipeline_run_traces (
	id bigserial primary key,
	run_id uuid not null references pipeline_runs (id) on delete cascade,
	pipe_id integer not null,
	op text not null,
	component text,
	trace jsonb not null default '{}',
	seq bigint not null
);

create index idx_pipeline_run_traces_run_id on pipeline_run_traces (run_id);
