import type { RocketRideClientPool } from './client-pool.js';
import { buildChatPipeline, buildIngestPipeline } from './pipeline-builder/index.js';
import type { RocketRidePipeline } from './pipeline-builder/rocketride-pipeline.js';
import type { ChatPipelineConfig, IngestPipelineConfig } from './pipeline-builder/types.js';

/** Thrown when a RocketRide pipeline lifecycle op exceeds its budget — a wedged/unresponsive engine. */
export class RocketRidePipelineTimeoutError extends Error {
	constructor(op: string, ms: number) {
		super(`RocketRide ${op} did not respond within ${ms}ms — the engine may be unresponsive or a pipeline task is wedged.`);
		this.name = 'RocketRidePipelineTimeoutError';
	}
}

const DEFAULT_OP_TIMEOUT_MS = 20_000;

/**
 * Resolves a project's ingest/chat pipeline configs to a running RocketRide
 * task token. Caches tokens in-process (per RocketRide's "start once, reuse many
 * times" guidance).
 *
 * RocketRide's `useExisting: true` reuses a running pipeline AS-IS — it does NOT
 * apply a changed definition. So when a config changes (a BYOA provider/model
 * switch) or a stale instance survives from a previous process, we reconcile:
 * `restart` the running task with the current definition. Without this,
 * `useExisting` would keep serving the old LLM node (e.g. a stale
 * `modelTotalTokens`) forever.
 *
 * Every RocketRide call is bounded by a timeout: a wedged engine task can make
 * `restart`/`use` hang indefinitely, and without a bound that stalls the whole
 * chat request. On timeout we throw `RocketRidePipelineTimeoutError` so the
 * caller fails fast with a clear, logged error instead of hanging.
 */
export class PipelineRegistry {
	private readonly tokenCache = new Map<string, string>();

	constructor(
		private readonly pool: RocketRideClientPool,
		private readonly opTimeoutMs = DEFAULT_OP_TIMEOUT_MS
	) {}

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
		// cleared). `restart` terminates it and starts the current definition;
		// `useExisting` alone would silently keep the old one. `token` is required by
		// the SDK even though projectId/source are given.
		const existing = await this.withTimeout(client.getTaskToken({ projectId, source }), 'getTaskToken').catch(() => undefined);
		if (existing) {
			await this.withTimeout(
				client.restart({ token: existing, projectId, source, pipeline: pipeline as unknown as Record<string, unknown> }),
				'pipeline restart'
			);
		}

		// pipelineTraceLevel:'summary' so the observability ingester receives FLOW events.
		const { token } = await this.withTimeout(client.use({ pipeline, useExisting: true, pipelineTraceLevel: 'summary' }), 'pipeline start');
		this.tokenCache.set(cacheKey, token);
		return token;
	}

	/** Bounds a RocketRide call so an unresponsive engine surfaces a clear error instead of hanging. */
	private async withTimeout<T>(op: Promise<T>, label: string): Promise<T> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new RocketRidePipelineTimeoutError(label, this.opTimeoutMs)), this.opTimeoutMs);
		});
		try {
			return await Promise.race([op, timeout]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}
}
