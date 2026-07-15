-- Real-time job progress: per-stage progress for the Job Progress Center.
--
-- pipeline_jobs previously exposed only a coarse status (queued/running/…).
-- These nullable columns carry the current stage and a 0-100 completion percent
-- so a client can render a live progress bar and, on (re)connect, read the
-- current state without waiting for the next event. Nullable + no backfill =
-- fully backward-compatible with in-flight rows.

alter table pipeline_jobs add column progress smallint;
alter table pipeline_jobs add column stage text;

-- Recent-jobs listing for a project (Job Progress Center history) is ordered by
-- last activity; index the hot path.
create index idx_pipeline_jobs_project_updated on pipeline_jobs (project_id, updated_at desc);
