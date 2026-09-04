# RAG retrieval evaluation

Retrieval changes (the similarity floor, follow-up query expansion, lexical
re-ranking, confidence calibration) are only as good as their effect on real
questions, so they are measured with a small offline eval set instead of by
eye.

## What is measured

For each case the question is asked through the real chat endpoint of a
running platform-api (a fresh conversation, with any `priorQuestions` replayed
first so follow-ups are evaluated as follow-ups) and the retrieved sources are
compared with the sources a good answer must draw on:

- **recall@k** - share of the expected sources within the top k retrieved (k = 8, the context limit).
- **MRR** - reciprocal rank of the first expected source.
- **mean confidence** - the calibrated confidence the API reported, to check it tracks recall.

## Running it

```bash
MESHIFY_API_URL=http://localhost:3000 MESHIFY_API_KEY=msk_... \
  node scripts/rag-eval.mjs tests/rag-eval/example.json --k 8 --min-recall 0.8
```

`tests/rag-eval/example.json` is a template: point `projectId` at a project
whose sources are ingested and list `expectedSources` as the source paths
(`meta.parent`: a document file name, a repository path, `slack/...`) or a path
suffix. The run prints one line per case, the misses with what was retrieved
instead, a JSON summary, and exits non-zero when recall@k falls under
`--min-recall`, so it can gate a retrieval change locally or in a job that has
access to a seeded stack.

## Building a real set

Keep the set in the repo next to the example, with 20-40 questions drawn from
real usage: direct questions, follow-ups that lean on the previous turn, and a
few that the project cannot answer (expected sources empty, so a confident
retrieval counts against the floor). Re-run it before and after every change to
`vector-search-context-retriever.ts`, `hybrid-rank.ts` or `RAG_MIN_SCORE`, and
record both numbers in the change description.
