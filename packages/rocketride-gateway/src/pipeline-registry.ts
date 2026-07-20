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

interface CachedToken {
	token: string;
	/** Identity of the pipeline definition the token was started with — a provider/model change alters it. */
	hash: string;
}

/**
 * Resolves a project's ingest/chat pipeline configs to a running RocketRide task
 * token. Caches tokens in-process (per RocketRide's "start once, reuse many
 * times" guidance).
 *
 * Two invariants this class must uphold, learned the hard way:
 *
 *  1. **Never fire concurrent lifecycle ops on the shared client.** The process
 *     holds ONE RocketRide client (a single DAP/WebSocket connection). Firing
 *     `restart`/`use` concurrently (e.g. a background warm racing a user's chat,
 *     both rebuilding the same pipeline after a provider switch) corrupts the
 *     connection and WEDGES the engine task — after which every call hangs until
 *     the engine is restarted. So all reconciles are SERIALIZED through a queue.
 *
 *  2. **Detect definition changes.** `useExisting: true` reuses a running
 *     pipeline AS-IS. On a provider/model switch the definition changes, so we
 *     key the cache by a hash of the pipeline and `restart` the running task when
 *     the hash differs; a stale token is never reused.
 *
 * Every RocketRide call is also bounded by a timeout so a wedged engine surfaces
 * a clear `RocketRidePipelineTimeoutError` instead of hanging indefinitely.
 */
export class PipelineRegistry {
	private readonly tokenCache = new Map<string, CachedToken>();
	/** Serializes reconciles across ALL keys — the shared client tolerates no concurrent restart/use. */
	private queue: Promise<unknown> = Promise.resolve();

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

	/** Drops the cached token so the next ensure* reconciles (e.g. after a provider/model config change). */
	invalidate(pipelineGuid: string, kind: 'ingest' | 'chat'): void {
		this.tokenCache.delete(`${kind}:${pipelineGuid}`);
	}

	private ensure(cacheKey: string, projectId: string, source: string, pipeline: RocketRidePipeline): Promise<string> {
		const hash = JSON.stringify(pipeline);
		const cached = this.tokenCache.get(cacheKey);
		// Fast path: current definition already running — no lock, no RocketRide call.
		if (cached && cached.hash === hash) return Promise.resolve(cached.token);
		return this.enqueue(() => this.reconcile(cacheKey, hash, projectId, source, pipeline));
	}

	/** Runs `fn` only after every previously-queued reconcile has settled (success or failure). */
	private enqueue<T>(fn: () => Promise<T>): Promise<T> {
		const run = this.queue.then(fn, fn);
		this.queue = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}

	private async reconcile(cacheKey: string, hash: string, projectId: string, source: string, pipeline: RocketRidePipeline): Promise<string> {
		// Re-check under the queue: a reconcile that ran just ahead of us may have
		// already started this exact definition (the warm-then-chat case).
		const cached = this.tokenCache.get(cacheKey);
		if (cached && cached.hash === hash) return cached.token;

		const client = await this.pool.getClient();

		// A task already running for this project/source may carry a stale definition
		// (previous process, or a provider/model switch). `restart` terminates it and
		// starts the current definition; `useExisting` alone would keep the old one.
		// `token` is required by the SDK even though projectId/source are given.
		const existing = await this.withTimeout(client.getTaskToken({ projectId, source }), 'getTaskToken').catch(() => undefined);
		if (existing) {
			await this.withTimeout(
				client.restart({ token: existing, projectId, source, pipeline: pipeline as unknown as Record<string, unknown> }),
				'pipeline restart'
			);
		}

		// pipelineTraceLevel:'summary' so the observability ingester receives FLOW events.
		const { token } = await this.withTimeout(client.use({ pipeline, useExisting: true, pipelineTraceLevel: 'summary' }), 'pipeline start');
		this.tokenCache.set(cacheKey, { token, hash });
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
