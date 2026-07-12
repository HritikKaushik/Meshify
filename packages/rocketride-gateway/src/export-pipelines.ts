import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildChatPipeline, buildIngestPipeline } from './pipeline-builder/index.js';

/**
 * Materializes the two pipeline shapes our builders produce into concrete
 * `.pipe` files (per RocketRide's mandatory workflow) so they can be opened
 * and run/inspected in the VS Code extension. These are TEMPLATES: at runtime
 * the platform generates one pipeline PER PROJECT with that project's real
 * GUID and Qdrant collections, so these sample files use placeholder values.
 *
 * Qdrant auth/host use ${ROCKETRIDE_*} placeholders (doc-idiomatic, see
 * PIPELINE_RULES "Environment Variables"); the runtime path instead threads
 * the concrete QDRANT_URL/QDRANT_API_KEY. Embedding/LLM keys already render as
 * ${ROCKETRIDE_OPENAI_KEY} in both.
 *
 *   pnpm --filter @meshify/rocketride-gateway export-pipelines
 */
const OUT_DIR = path.resolve(fileURLToPath(import.meta.url), '../../../../pipelines');

// Placeholder Qdrant target — shows the "cloud" node shape with env-var placeholders.
const qdrant = (collection: string) => ({
	host: '${ROCKETRIDE_QDRANT_HOST}',
	port: 6333,
	collection,
	apiKey: '${ROCKETRIDE_QDRANT_APIKEY}',
});

async function main(): Promise<void> {
	const ingest = buildIngestPipeline({
		pipelineGuid: randomUUID(),
		target: 'documents',
		qdrant: qdrant('proj_SAMPLE_documents'),
		embedding: { provider: 'openai', profile: 'text-embedding-3-large', apiKeyEnvVar: 'ROCKETRIDE_OPENAI_KEY' },
		chunkSize: 768,
	});

	const chat = buildChatPipeline({
		pipelineGuid: randomUUID(),
		llm: { provider: 'openai', profile: 'openai-5', apiKeyEnvVar: 'ROCKETRIDE_OPENAI_KEY' },
		embedding: { provider: 'openai', profile: 'text-embedding-3-large', apiKeyEnvVar: 'ROCKETRIDE_OPENAI_KEY' },
		docsCollection: qdrant('proj_SAMPLE_documents'),
		codeCollection: qdrant('proj_SAMPLE_code'),
		systemInstructions: [],
	});

	await mkdir(OUT_DIR, { recursive: true });
	// 2-space JSON keeps `components` first (insertion order) as the rules require.
	await writeFile(path.join(OUT_DIR, 'ingest.pipe'), JSON.stringify(ingest, null, 2) + '\n');
	await writeFile(path.join(OUT_DIR, 'chat.pipe'), JSON.stringify(chat, null, 2) + '\n');

	console.log(`Wrote ${path.join(OUT_DIR, 'ingest.pipe')}`);
	console.log(`Wrote ${path.join(OUT_DIR, 'chat.pipe')}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
