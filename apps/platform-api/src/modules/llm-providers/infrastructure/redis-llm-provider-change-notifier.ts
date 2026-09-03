import type { LlmProviderChangeNotifier } from '../application/llm-provider-change.port.js';

export const LLM_PROVIDER_CHANGES_CHANNEL = 'meshify:llm-provider-changes';

/** Structural Redis slices (ioredis-compatible) so tests can use in-memory fakes. */
export interface RedisPublisherConnection {
	publish(channel: string, message: string): Promise<unknown>;
}
export interface RedisSubscriberConnection {
	subscribe(channel: string): Promise<unknown>;
	on(event: 'message', handler: (channel: string, message: string) => void): unknown;
}

interface NotifierLogger {
	warn(obj: Record<string, unknown>, msg: string): void;
}

interface ChangeMessage {
	orgId: string;
	/** Identifies the publishing replica; a replica ignores its own echo (it already invalidated locally). */
	origin: string;
}

/**
 * Cross-replica change propagation. Provider connect/activate/disconnect run on
 * whichever API replica served the request; the resolution and pipeline caches
 * live in every replica's memory. This decorator applies the change locally
 * and publishes it over Redis so the other replicas drop their cached provider
 * and chat pipelines too - otherwise they kept answering with the previous
 * vendor until their process restarted.
 *
 * Warming stays local: only the replica that served the activation builds
 * pipelines eagerly; the others rebuild lazily on their next chat turn.
 */
export class RedisLlmProviderChangeNotifier implements LlmProviderChangeNotifier {
	private readonly origin = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

	constructor(
		private readonly local: LlmProviderChangeNotifier,
		private readonly publisher: RedisPublisherConnection,
		subscriber: RedisSubscriberConnection,
		private readonly logger?: NotifierLogger
	) {
		void subscriber.subscribe(LLM_PROVIDER_CHANGES_CHANNEL);
		subscriber.on('message', (channel, message) => {
			if (channel !== LLM_PROVIDER_CHANGES_CHANNEL) return;
			let parsed: ChangeMessage;
			try {
				parsed = JSON.parse(message) as ChangeMessage;
			} catch {
				return;
			}
			if (!parsed || typeof parsed.orgId !== 'string' || parsed.origin === this.origin) return;
			this.local.notifyChanged(parsed.orgId).catch((err: unknown) => {
				this.logger?.warn({ orgId: parsed.orgId, err: err instanceof Error ? err.message : String(err) }, 'failed to apply a replicated LLM provider change');
			});
		});
	}

	async notifyChanged(orgId: string): Promise<void> {
		await this.local.notifyChanged(orgId);
		const message: ChangeMessage = { orgId, origin: this.origin };
		try {
			await this.publisher.publish(LLM_PROVIDER_CHANGES_CHANNEL, JSON.stringify(message));
		} catch (err) {
			// The local change is applied; other replicas fall back to the cache TTL.
			this.logger?.warn({ orgId, err: err instanceof Error ? err.message : String(err) }, 'failed to publish LLM provider change to other replicas');
		}
	}

	warmChatPipeline(orgId: string, projectId: string): Promise<boolean> {
		return this.local.warmChatPipeline(orgId, projectId);
	}

	warmChatPipelines(orgId: string): Promise<void> {
		return this.local.warmChatPipelines(orgId);
	}
}
