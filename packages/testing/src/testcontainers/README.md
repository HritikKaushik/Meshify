# testcontainers helpers (scaffold)

Shared container lifecycle for **integration** tests that need real backing
services. Requires Docker and the `testcontainers` package.

Add `testcontainers` to `@meshify/testing` devDependencies, then implement one
module per dependency, each exposing a `start*()` that returns a connection
string / client plus a `stop()`:

- `postgres.ts` — `PostgreSqlContainer`, runs `@meshify/data-access` migrations against it.
- `redis.ts` — `RedisContainer` (BullMQ + rate limiter integration).
- `qdrant.ts` — `GenericContainer('qdrant/qdrant')` (vector-store integration).

Consumed only by `*.integration.test.ts` under each app's `tests/integration/`
and the repo-root `tests/integration/`, gated behind the `test:integration`
script so unit runs never require Docker.
