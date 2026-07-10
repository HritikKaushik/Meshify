-- Observability (Step 8). The DAP ingester writes RocketRide runtime events
-- here. pipeline_runs/pipeline_run_traces already exist (0001); this extends
-- runs with the correlation key and the status/cost/metric snapshot fields
-- carried by apaevt_status_update (TASK_STATUS).

alter table pipeline_runs
	add column run_key text,
	add column name text,
	add column status text,
	add column completed boolean not null default false,
	add column tokens_total numeric,
	add column cost_usd numeric,
	add column cpu_percent numeric,
	add column cpu_memory_mb numeric,
	add column gpu_memory_mb numeric,
	add column error_count integer not null default 0,
	add column updated_at timestamptz not null default now();

-- Natural run key: project_id:source:startTime. Deterministic per run, so the
-- ingester upserts idempotently and can restart (or briefly double-run) without
-- creating duplicate run rows. Full (non-partial) unique index so `on conflict
-- (run_key)` can use it; run_key is always populated by the ingester.
create unique index idx_pipeline_runs_run_key on pipeline_runs (run_key);

-- pipeline_run_traces.op is widened in use: FLOW ops (begin/enter/leave/end)
-- plus 'output' and 'sse' folded into the same table (no separate logs table).
