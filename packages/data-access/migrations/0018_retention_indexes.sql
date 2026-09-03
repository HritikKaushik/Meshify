-- Indexes for the retention sweeps and for hot lookups that scanned.
--
-- pipeline_runs / audit_logs are pruned by age by the worker's maintenance
-- retention task (see integration-maintenance.processor.ts); without these the
-- daily delete scanned the whole table.
create index if not exists idx_pipeline_runs_ended_at on pipeline_runs (ended_at);
create index if not exists idx_pipeline_runs_started_at on pipeline_runs (started_at);
create index if not exists idx_audit_logs_created_at on audit_logs (created_at);

-- Slack conversation reads are per workspace / per channel (list, purge,
-- source-path enumeration) and only had the project_id index.
create index if not exists idx_slack_conversations_workspace_id on slack_conversations (workspace_id);
create index if not exists idx_slack_conversations_slack_channel_id on slack_conversations (slack_channel_id);

-- clerk_org_links.clerk_org_id is declared UNIQUE (0007), which already builds
-- an index; the explicit one duplicated it on every write.
drop index if exists idx_clerk_org_links_clerk_org_id;
