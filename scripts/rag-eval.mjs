#!/usr/bin/env node
/**
 * Offline RAG evaluation against a running platform-api.
 *
 *   MESHIFY_API_URL=http://localhost:3000 MESHIFY_API_KEY=msk_... \
 *     node scripts/rag-eval.mjs tests/rag-eval/example.json [--k 8] [--min-recall 0.8]
 *
 * The eval set names a project and questions with the source paths a good
 * answer must retrieve (see tests/rag-eval/example.json and
 * docs/testing/rag-evaluation.md). Each question is asked through the real
 * chat endpoint (a fresh conversation per case, optional prior turns replayed
 * first), and the retrieved sources are scored with recall@k and MRR. Exits 1
 * when recall falls under --min-recall, so a retrieval change can be gated.
 */
import { readFile } from 'node:fs/promises';
import { recallAtK, reciprocalRank, summarize } from './rag-eval-metrics.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};
if (!file) {
	console.error('usage: node scripts/rag-eval.mjs <eval-set.json> [--k 8] [--min-recall 0.8]');
	process.exit(2);
}
const k = Number(flag('k', 8));
const minRecall = Number(flag('min-recall', 0));
const apiUrl = (process.env.MESHIFY_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const apiKey = process.env.MESHIFY_API_KEY;
if (!apiKey) {
	console.error('MESHIFY_API_KEY is required (a platform-api key for the org that owns the project)');
	process.exit(2);
}

const set = JSON.parse(await readFile(file, 'utf8'));
const headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };

async function ask(projectId, question, conversationId) {
	const res = await fetch(`${apiUrl}/v1/projects/${projectId}/chat`, { method: 'POST', headers, body: JSON.stringify({ question, conversationId }) });
	if (!res.ok) throw new Error(`chat ${res.status}: ${await res.text()}`);
	return res.json();
}

const results = [];
for (const c of set.cases) {
	let conversationId;
	for (const prior of c.priorQuestions ?? []) {
		const turn = await ask(set.projectId, prior, conversationId);
		conversationId = turn.conversationId;
	}
	const answer = await ask(set.projectId, c.question, conversationId);
	const retrieved = (answer.retrievedDocuments ?? []).map((d) => d.sourcePath);
	const recall = recallAtK(c.expectedSources, retrieved, k);
	const rr = reciprocalRank(c.expectedSources, retrieved);
	results.push({ question: c.question, recall, reciprocalRank: rr, confidence: answer.confidence, retrieved: retrieved.slice(0, k) });
	console.log(`${recall === 1 ? 'ok  ' : 'MISS'} recall@${k}=${recall.toFixed(2)} rr=${rr.toFixed(2)} conf=${(answer.confidence ?? 0).toFixed(2)}  ${c.question}`);
	if (recall < 1) console.log(`      expected ${JSON.stringify(c.expectedSources)}\n      got      ${JSON.stringify(retrieved.slice(0, k))}`);
}

const summary = summarize(results, k);
console.log('\n' + JSON.stringify(summary, null, 2));
if (summary.recallAtK < minRecall) {
	console.error(`recall@${k} ${summary.recallAtK} is below the required ${minRecall}`);
	process.exit(1);
}
