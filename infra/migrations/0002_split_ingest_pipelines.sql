-- RocketRide pipelines are static DAGs with no per-item dynamic collection
-- routing, so documents and code each need their own ingest pipeline
-- (identical shape, different terminal qdrant collection). Split the single
-- rocketride_ingest_pipeline_id into one column per target.

alter table projects rename column rocketride_ingest_pipeline_id to rocketride_docs_ingest_pipeline_id;
alter table projects add column rocketride_code_ingest_pipeline_id uuid not null default gen_random_uuid();
alter table projects alter column rocketride_code_ingest_pipeline_id drop default;
