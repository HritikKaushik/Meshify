---
title: Troubleshooting
purpose: Symptom → cause → fix for the failures on-call actually sees.
audience: On-call, backend engineers.
owner: Platform Team
status: stable
last_updated: 2026-07-14
prerequisites:
  - deployment.md
related:
  - ../backend/auth.md
  - ../backend/queues-and-workers.md
  - ../ai/rag-and-ingestion.md
---

# Troubleshooting

> Start from the symptom. Each row links to the subsystem doc with the deeper
> explanation.

## Overview
Meshify fails loudly and specifically: readiness names the down dependency,
auth errors are uniform, and every job has a durable `pipeline_jobs` record.

## Auth & requests
| Symptom | Cause | Fix / where |
| --- | --- | --- |
| Browser 401 on `/api` | No Clerk session, or org not provisioned | [Auth](../backend/auth.md) |
| 401 for one org | Key revoked/expired or missing `clerk_org_links` | Re-provision org; `issue-api-key.ts` |
| 401 for everyone | `PLATFORM_API_KEY_PEPPER` mismatch | Align pepper across issuer + API |
| 404 for a real project | Cross-org access (isolation) | Use the owning org's key |
| 429 Too Many Requests | Rate-limit window hit | Tune `RATE_LIMIT_MAX` / `_WINDOW_SEC` |

## Chat / AI
| Symptom | Cause | Fix / where |
| --- | --- | --- |
| Chat returns 502 | RocketRide unreachable / invalid pipeline | Check `ROCKETRIDE_URI`; resolver retries once — [RAG](../ai/rag-and-ingestion.md) |
| Empty / low-confidence answers | Nothing indexed for the project | Confirm ingestion completed |
| Wrong sources cited | Stale vectors after delete | Ensure delete purged Qdrant chunks |

## Ingestion / queues
| Symptom | Cause | Fix / where |
| --- | --- | --- |
| Upload never indexes | Worker down / wrong `REDIS_URL` | Start `apps/worker` — [Queues](../backend/queues-and-workers.md) |
| Job dead-lettered | 5 attempts failed | Inspect `pipeline_jobs.last_error`; fix + re-enqueue |
| Repo sync fails | GitHub App creds / archive too large | Check `GITHUB_APP_*`, size limits |

## Data / infra
| Symptom | Cause | Fix / where |
| --- | --- | --- |
| "relation does not exist" | Migrations not applied | `pnpm migrate` — [Data Model](../architecture/data-model.md) |
| Readiness `503` | A dependency is down | Response body names it (pg/redis/qdrant) |
| Boot crash on startup | Invalid env | zod error names the var — [Env](../reference/environment-variables.md) |

## Best Practices
- Read the readiness body and the structured logs first — they name the cause.
- For a stuck ingestion, check `pipeline_jobs` (durable) before Redis.

## References
- `apps/platform-api/src/modules/health/**`, `packages/data-access/src/pipeline-jobs/**`

## Related
- [Deployment](deployment.md) · [Auth](../backend/auth.md) · [Queues & Workers](../backend/queues-and-workers.md)

## Next
- [FAQ](../reference/faq.md).

---
[← Handbook](../README.md)
