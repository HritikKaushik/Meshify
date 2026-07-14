# MSW handlers (scaffold)

Shared [MSW](https://mswjs.io) request handlers for mocking HTTP at the network
boundary — the web app's calls to the BFF, and the BFF/worker's calls to
RocketRide / GitHub.

Add `msw` to `@meshify/testing` devDependencies, then:

- `handlers.ts` — default handlers for `/api/v1/*` (projects, chats, documents,
  repositories) built from `@meshify/testing/factories`.
- `server.ts` — `setupServer(...handlers)` for Node (Vitest) suites.
- `browser.ts` — `setupWorker(...handlers)` for the web app / Playwright.

Web unit/integration tests import the server and override per-test with
`server.use(...)`. This becomes the single definition of API mocks shared by
frontend tests, BFF tests and e2e.
