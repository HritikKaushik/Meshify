-- Repository ingestion (Step 5).
--
-- files.object_storage_key becomes nullable: repository files are not stored
-- individually in object storage — GitHub files can always be re-fetched via
-- the API, and ZIP uploads keep the whole archive under
-- repositories.archive_object_key instead of thousands of per-file objects.
-- Uploaded documents keep their per-file key.

alter table files alter column object_storage_key drop not null;

alter table files drop constraint files_status_check;
alter table files add constraint files_status_check
	check (status in ('pending', 'parsed', 'embedded', 'failed', 'deleted'));

alter table repositories add column archive_object_key text;

create unique index idx_files_repo_path on files (repository_id, path) where repository_id is not null;
