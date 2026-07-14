---
title: packages/github
purpose: GitHub App client for cloning repositories during ingestion.
audience: Backend engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-14
related:
  - ../../docs/ai/rag-and-ingestion.md
---

# @meshify/github

GitHub App integration used by the worker to fetch repository archives.

## Purpose & responsibilities
- Resolve a repo's HEAD (`getHead`) and download its tarball (`downloadTarball`) via the GitHub App.

## Public API
`GitHubRepoClient` and related types.

## Dependencies
None (uses `fetch` + app credentials).

## Consumers
`apps/worker` (repo ingestion).

## How to extend
Add API calls to `GitHubRepoClient`; keep credentials driven by `GITHUB_APP_*` env.

## How to test / debug
- Requires `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`.
- Repo URLs are constrained by `parseGitHubUrl` (github.com only — no arbitrary SSRF).

## Key files
`src/**`.

---
[← Handbook](../../docs/README.md)
