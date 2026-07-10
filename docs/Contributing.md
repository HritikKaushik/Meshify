# Contributing

## Workflow

Trunk-based development. Short-lived branches off `main` (`feat/<module>-<topic>`, `fix/<topic>`, `refactor/<topic>`), PR back to `main`. CI (typecheck + build + test via Turbo) must be green before merge.

## Commits

- One logical change per commit; the subject says *what*, the body says *why* — including the constraint or finding that motivated it, not a restatement of the diff.
- File moves use `git mv` (or plain `mv` + `git add -A` in the same commit) so rename detection preserves history. Never delete-and-recreate a file you are moving.
- Migrations, their consuming code, and `.env.example` updates ship in the same commit as the feature that needs them.

## Pull requests

- Small enough to review in one sitting; split refactors from behavior changes.
- State how the change was verified: tests added, plus (for anything with a runtime surface) the actual flow you exercised — "uploaded a file, watched the job reach `failed` with the expected error" beats "typecheck passes".
- Schema changes: call out backward compatibility explicitly (additive-only within a release).

## Standards checklist

- [ ] Follows [NamingConventions.md](NamingConventions.md) — file suffixes, no banned names
- [ ] Respects layer boundaries ([FolderStructure.md](FolderStructure.md)) — apps → packages, domain imports nothing
- [ ] RocketRide SDK touched only inside `@meshify/rocketride-gateway`
- [ ] New env vars in the zod schema **and** `.env.example`
- [ ] Every Postgres query on tenant data scoped by `project_id`; controllers read it from `req.project.id` (isolation guard), never from the body
- [ ] No secrets in code, pipelines use `${ROCKETRIDE_*}` substitution
- [ ] Use-cases tested against fakes; no test requires live external services
- [ ] Dockerfile COPY lists updated if a package was added/moved

## Settled decisions

[Architecture.md](Architecture.md) lists decisions that are settled (isolation model, hybrid search, GitHub App, stateless workers, RocketRide-as-engine). Reopening one requires a written proposal with the trade-off that changed — not a drive-by change in a feature PR.
