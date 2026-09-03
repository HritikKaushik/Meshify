-- A document's vectors are keyed by its source path, which is the filename, so
-- two documents with the same name in one project cannot be told apart when
-- one is deleted: the purge removed both sets of chunks while the other row
-- stayed "embedded" and chat quietly lost its content. Make the filename unique
-- per project; the upload use case answers 409 on a clash (delete the existing
-- document or rename the file). This fails loudly on a database that already
-- holds duplicates — resolve them by deleting one copy before deploying.
create unique index uq_documents_project_filename on documents (project_id, filename);
