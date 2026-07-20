import type { RocketRideClientPool } from './client-pool.js';
import { buildChatPipeline, buildIngestPipeline } from './pipeline-builder/index.js';
import type { RocketRidePipeline } from './pipeline-builder/rocketride-pipeline.js';
import type { ChatPipelineConfig, IngestPipelineConfig } from './pipeline-builder/types.js';

/**
 * Resolves a project's ingest/chat pipeline configs to a running RocketRide
 * task token. Caches tokens in-process (per RocketRide's "start once, reuse many
 * times" guidance).
 *
 * IMPORTANT: RocketRide's `useExisting: true` reuses a running pipeline AS-IS —
 * it does NOT apply a changed definition. So when a config changes (a BYOA
 * provider/model switch) or a stale instance survives from a previous process,
 * we must reconcile: `restart` the running task with the current definition.
 * Without this, `useExisting` would keep serving the old LLM node (e.g. a stale
 * `modelTotalTokens`) forever.
 */
export class PipelineRegistry {
	private readonly tokenCache = new Map<string, string>();

	constructor(private readonly pool: RocketRideClientPool) {}

	async ensureIngestPipeline(config: IngestPipelineConfig): Promise<string> {
		return this.ensure(`ingest:${config.pipelineGuid}`, config.pipelineGuid, 'webhook_1', buildIngestPipeline(config));
	}

	async ensureChatPipeline(config: ChatPipelineConfig): Promise<string> {
		return this.ensure(`chat:${config.pipelineGuid}`, config.pipelineGuid, 'chat_1', buildChatPipeline(config));
	}

	/** Forces the next ensure* call to reconcile + restart the pipeline (e.g. after a provider/model config change). */
	invalidate(pipelineGuid: string, kind: 'ingest' | 'chat'): void {
		this.tokenCache.delete(`${kind}:${pipelineGuid}`);
	}

	private async ensure(cacheKey: string, projectId: string, source: string, pipeline: RocketRidePipeline): Promise<string> {
		const cached = this.tokenCache.get(cacheKey);
		if (cached) return cached;

		const client = await this.pool.getClient();

		// If a task is already running for this project/source, it may carry a stale
		// definition (previous process, or a config change since our local cache was
		// cleared). `restart` terminates it and starts the current definition in one
		// round-trip; `useExisting` alone would silently keep the old one.
		const existing = await client.getTaskToken({ projectId, source }).catch(() => undefined);
		if (existing) {
			// `token` is required by the SDK even though the projectId/source are given.
			await client.restart({ token: existing, projectId, source, pipeline: pipeline as unknown as Record<string, unknown> });
		}

		// pipelineTraceLevel:'summary' so the observability ingester receives FLOW events.
		const { token } = await client.use({ pipeline, useExisting: true, pipelineTraceLevel: 'summary' });
		this.tokenCache.set(cacheKey, token);
		return token;
	}
}
