---
title: packages/object-storage
purpose: S3-compatible object storage wrapper for uploads and archives.
audience: Backend engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-14
related:
  - ../../docs/ai/rag-and-ingestion.md
---

# @meshify/object-storage

A thin S3-compatible client (MinIO locally, S3/R2/Spaces in production). Callers
never touch the AWS SDK directly, so swapping providers only touches config.

## Purpose & responsibilities
- `putObject` / `getObject` / `deleteObject` against a configured bucket.

## Public API
`ObjectStorageClient`, `ObjectStorageConfig`.

## Dependencies
`@aws-sdk/client-s3`.

## Consumers
`apps/platform-api` (document uploads, delete), `apps/worker` (archive/document reads, delete).

## How to extend
Add methods to `ObjectStorageClient`; keep the surface S3-generic.

## How to test / debug
- Configured entirely via `S3_*` env vars ([Env](../../docs/reference/environment-variables.md)).
- Keys are project-scoped: `projects/<projectId>/documents/<id>/<filename>`.

## Key files
`src/client.ts`, `src/index.ts`.

---
[← Handbook](../../docs/README.md)
