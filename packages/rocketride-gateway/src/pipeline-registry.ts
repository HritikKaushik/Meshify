import type { RocketRideClientPool } from './client-pool.js';
import { buildChatPipeline, buildIngestPipeline } from './pipeline-builder/index.js';
import type { ChatPipelineConfig, IngestPipelineConfig } from './pipeline-builder/types.js';

/**
 * Resolves a project's ingest/chat pipeline configs to a running RocketRide
 * task token, starting the pipeline with useExisting:true if it isn't already
 * running. Caches tokens in-process (per RocketRide's "start once, reuse many
 * times" guidance) — cheap to rebuild on restart since useExisting makes the
 * resolve idempotent.
 */
export class PipelineRegistry {
	private readonly tokenCache = new Map<string, string>();

	constructor(private readonly pool: RocketRideClientPool) {}

	async ensureIngestPipeline(config: IngestPipelineConfig): Promise<string> {
		const cacheKey = `ingest:${config.pipelineGuid}`;
		const cached = this.tokenCache.get(cacheKey);
		if (cached) return cached;

		const pipeline = buildIngestPipeline(config);
		const client = await this.pool.getClient();
		const { token } = await client.use({ pipeline, useExisting: true });
		this.tokenCache.set(cacheKey, token);
		return token;
	}

	async ensureChatPipeline(config: ChatPipelineConfig): Promise<string> {
		const cacheKey = `chat:${config.pipelineGuid}`;
		const cached = this.tokenCache.get(cacheKey);
		if (cached) return cached;

		const pipeline = buildChatPipeline(config);
		const client = await this.pool.getClient();
		const { token } = await client.use({ pipeline, useExisting: true });
		this.tokenCache.set(cacheKey, token);
		return token;
	}

	/** Forces the next ensure* call to restart the pipeline (e.g. after a provider/profile config change). */
	invalidate(pipelineGuid: string, kind: 'ingest' | 'chat'): void {
		this.tokenCache.delete(`${kind}:${pipelineGuid}`);
	}
}
