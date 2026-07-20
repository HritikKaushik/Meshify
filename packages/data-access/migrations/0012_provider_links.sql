-- Link existing aggregates to the provider platform, open enumerations that
-- must not require migrations per provider, add webhook-grade job dedup, and
-- backfill org-level Slack integrations from the project-scoped workspaces.

-- --- knowledge_connectors: org-integration link + sync policy ---------------

alter table knowledge_connectors add column integration_id uuid references integrations (id) on delete set null;
-- {"trigger": "event" | "manual" | "interval", "intervalMinutes"?: number}.
-- Read by the maintenance scheduler; interval scheduling later is data, not code.
alter table knowledge_connectors add column sync_policy jsonb not null default '{"trigger": "event"}';
-- Provider ids are registry-validated; the type CHECK would force a migration
-- per new provider.
alter table knowledge_connectors drop constraint knowledge_connectors_type_check;

create index idx_knowledge_connectors_integration on knowledge_connectors (integration_id);

-- --- repositories: stable GitHub identity + sync timestamp ------------------

alter table repositories
	add column github_repo_id bigint,
	add column owner text,
	add column name text,
	add column last_synced_at timestamptz;

create index idx_repositories_github_repo_id on repositories (github_repo_id);

-- Backfill owner/name from the pasted URL; github_repo_id is backfilled lazily
-- by the first sync that talks to the API (webhook resolution falls back to
-- owner/name until then).
update repositories
set owner = split_part(regexp_replace(trim(trailing '/' from remote_url), '^https://github\.com/', ''), '/', 1),
    name = regexp_replace(split_part(regexp_replace(trim(trailing '/' from remote_url), '^https://github\.com/', ''), '/', 2), '\.git$', '')
where source = 'github' and remote_url is not null;

-- --- pipeline_jobs: deterministic dedup + open job types --------------------

alter table pipeline_jobs add column dedupe_key text;
-- At most one QUEUED job per dedupe key: webhook bursts and double-clicks
-- collapse, while a running job still admits exactly one queued follow-up
-- (events arriving mid-run are not lost). NULL keys never collide, so
-- non-deduped jobs are unaffected. The predicate is exactly `status = 'queued'`
-- so `on conflict (dedupe_key) where status = 'queued'` can infer this index.
create unique index idx_pipeline_jobs_dedupe_queued on pipeline_jobs (dedupe_key) where status = 'queued';
-- Job types now include the generic 'source_sync'; future providers add none.
alter table pipeline_jobs drop constraint pipeline_jobs_job_type_check;

-- --- slack_workspaces: link to the org-level integration --------------------

alter table slack_workspaces add column integration_id uuid references integrations (id) on delete set null;
-- Tokens now live in integration_credentials; workspace rows created by the
-- attach flow carry none. The legacy column stays as a decrypt fallback until
-- a post-verification cleanup migration drops it.
alter table slack_workspaces alter column encrypted_access_token drop not null;

-- --- Backfill: org-level Slack integrations ---------------------------------

-- One integration per distinct (org, team) across all project workspaces.
-- external_account_id = Slack team id. The most recently updated workspace
-- donates its encrypted bot token (tokens for the same app+team are
-- interchangeable; a post-deploy health sweep flags any that fail auth.test).
insert into integrations (org_id, provider, mode, external_account_id, external_account_name, status, metadata)
select distinct on (p.org_id, w.team_id)
       p.org_id,
       'slack',
       'managed',
       w.team_id,
       coalesce(w.team_name, w.team_id),
       'active',
       jsonb_build_object('teamId', w.team_id, 'botUserId', w.bot_user_id, 'scope', w.scope, 'backfilled', true)
from slack_workspaces w
join projects p on p.id = w.project_id
order by p.org_id, w.team_id, w.updated_at desc;

insert into integration_credentials (integration_id, kind, encrypted_value)
select distinct on (i.id)
       i.id,
       'access_token',
       w.encrypted_access_token
from integrations i
join projects p on p.org_id = i.org_id
join slack_workspaces w on w.project_id = p.id and w.team_id = i.external_account_id
where i.provider = 'slack' and (i.metadata->>'backfilled')::boolean is true
order by i.id, w.updated_at desc;

update slack_workspaces w
set integration_id = i.id
from projects p, integrations i
where p.id = w.project_id
  and i.org_id = p.org_id
  and i.provider = 'slack'
  and i.external_account_id = w.team_id;

update knowledge_connectors c
set integration_id = w.integration_id
from slack_workspaces w
where w.connector_id = c.id and w.integration_id is not null;
