/**
 * Mandatory RocketRide setup verification script (per ROCKETRIDE_README.md).
 * Run with `pnpm --filter @meshify/rocketride-gateway check`.
 *
 * Verifies: env is valid, the RocketRide server is reachable and
 * authenticates, and both pipeline shapes we generate (ingest + chat) pass
 * server-side `validate()` before anything ever tries to run them.
 */
import { loadEnv } from '@meshify/config';
import { RocketRideClientPool } from './client-pool.js';
import { buildChatPipeline, buildIngestPipeline } from './pipeline-builder/index.js';

const consoleLogger = {
	info: (obj: Record<string, unknown>, msg: string) => console.log(`[info] ${msg}`, obj),
	warn: (obj: Record<string, unknown>, msg: string) => console.warn(`[warn] ${msg}`, obj),
	error: (obj: Record<string, unknown>, msg: string) => console.error(`[error] ${msg}`, obj),
};

async function main(): Promise<void> {
	console.log('1/4 Loading and validating environment...');
	const env = loadEnv();
	console.log(`    OK — ROCKETRIDE_URI=${env.ROCKETRIDE_URI}`);

	console.log('2/4 Connecting to RocketRide server...');
	const pool = new RocketRideClientPool(env, consoleLogger);
	const client = await pool.getClient();
	console.log('    OK — connected and authenticated');

	console.log('3/4 Validating a sample document-ingest pipeline...');
	const ingestPipeline = buildIngestPipeline({
		pipelineGuid: '00000000-0000-4000-8000-000000000001',
		target: 'documents',
		qdrant: { host: 'localhost', port: 6333, collection: 'meshify_check_documents' },
		embedding: { provider: 'openai', profile: 'text-embedding-3-large', apiKeyEnvVar: 'ROCKETRIDE_OPENAI_KEY' },
		chunkSize: 768,
	});
	// The engine's rrext_validate expects the .pipe wrapper `{ pipeline: {...} }`.
	// The SDK's use()/restart() auto-unwrap that form, but validate() forwards its
	// argument verbatim — so a flat PipelineConfig arrives with components:null and
	// fails with ccode 40. Wrap it here (the runtime use()/restart() stay flat). A
	// successful validate returns the normalized pipeline with no errors/warnings
	// arrays, so default them.
	const ingestResult = await client.validate({ pipeline: { pipeline: ingestPipeline } });
	const ingestErrors = ingestResult.errors ?? [];
	if (ingestErrors.length > 0) {
		throw new Error(`Ingest pipeline invalid: ${JSON.stringify(ingestErrors)}`);
	}
	console.log(`    OK — ${(ingestResult.warnings ?? []).length} warning(s)`);

	console.log('4/4 Validating a sample chat pipeline...');
	const chatPipeline = buildChatPipeline({
		pipelineGuid: '00000000-0000-4000-8000-000000000002',
		llm: { provider: 'openai', profile: 'openai-5', apiKeyEnvVar: 'ROCKETRIDE_OPENAI_KEY' },
	});
	const chatResult = await client.validate({ pipeline: { pipeline: chatPipeline } });
	const chatErrors = chatResult.errors ?? [];
	if (chatErrors.length > 0) {
		throw new Error(`Chat pipeline invalid: ${JSON.stringify(chatErrors)}`);
	}
	console.log(`    OK — ${(chatResult.warnings ?? []).length} warning(s)`);

	await pool.shutdown();
	console.log('\nAll checks passed.');
}

main().catch((err) => {
	console.error('\nCheck failed:', err instanceof Error ? err.message : err);
	process.exit(1);
});
