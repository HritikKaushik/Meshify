# Dead Code Report

From the architectural audit (2026-07-10, commit `872c105`), per the rule "report, don't delete." Re-audit when major steps land.

## Findings and dispositions

| Item | Location | Finding | Disposition |
|---|---|---|---|
| `llm` field on `IngestPipelineConfig` | rocketride-gateway `pipeline-builder/types.ts` | Required by the type but never read by `buildIngestPipeline` (the ingest DAG has no LLM node); worker constructed LLM config for nothing | **Fixed** in refactor Phase 3 — `llm` moved to `ChatPipelineConfig` only; generated pipeline JSON verified byte-identical before/after |
| `FakeRagService` | rocketride-gateway | Exported with zero importers at audit time | **Kept deliberately** — it is the test seam for `RagPort`; consumed by unit tests as of refactor Phase 5 |
| `PipelineRegistry.invalidate()` | rocketride-gateway | No callers yet | **Kept** — documented API for the "project changed LLM/embedding profile" path; removing it would be deleted the day Step 6 (chat) needs it |
| `check.ts` | rocketride-gateway | Script-shaped file among library sources | **Kept in place** — mandated by RocketRide's setup checklist (`ROCKETRIDE_README.md`), package-specific by design, wired as the package's `check` script |

## Explicitly searched for, not found

- Unused folders, experiment leftovers, `temp*`/`*2`/`*-final` files: none (`git ls-files` sweep).
- Duplicate utilities: none (the one real duplication — the logger — was consolidated into `@meshify/shared` in Phase 2).
- Unused dependencies: none; every declared dependency in all 9 manifests has at least one import (manual sweep). `pino` was removed from the worker when the shared logger landed.
- Circular dependencies: none (`madge --circular` across all 77 resolved modules).
- Orphaned exports beyond the table above: none worth tracking.
