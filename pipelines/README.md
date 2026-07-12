# Pipeline files (`.pipe`)

**Generated, not hand-written.** These are produced by
`pnpm --filter @meshify/rocketride-gateway export-pipelines`, straight from the
same builders the platform uses at runtime
(`packages/rocketride-gateway/src/pipeline-builder/`), so they always match what
the code actually sends to RocketRide. Regenerate them after changing a builder.

- `ingest.pipe` — document/code ingestion: `webhook → parse → preprocessor_langchain → embedding_openai → qdrant`
- `chat.pipe` — RAG: `chat → embedding_openai → [qdrant(docs), qdrant(code)] → prompt → llm_openai → response_answers` (+ `response_documents`)

## These are TEMPLATES

Meshify is multi-tenant: at runtime it generates **one pipeline per project**,
each with that project's own `project_id` GUID and Qdrant collections
(`proj_<id>_documents` / `_code`). A single static `.pipe` file can't represent
every tenant, so the platform builds them programmatically and passes them to
the SDK as `pipeline` objects (`client.use({ pipeline })`) — a first-class,
documented path in the RocketRide TS SDK.

These exported files therefore use placeholders:

- `proj_SAMPLE_documents` / `proj_SAMPLE_code` — replace with a real collection
- `${ROCKETRIDE_QDRANT_HOST}` / `${ROCKETRIDE_QDRANT_APIKEY}` — set in `.env`
  (the runtime path instead threads the concrete `QDRANT_URL` / `QDRANT_API_KEY`)
- `${ROCKETRIDE_OPENAI_KEY}` — same in both file and runtime

## Why they exist

To open in the RocketRide VS Code extension for visual inspection / running /
debugging of the exact pipeline shapes the platform executes — the mandatory
RocketRide workflow is `.pipe`-file oriented, and the running code otherwise
keeps these only in memory.
