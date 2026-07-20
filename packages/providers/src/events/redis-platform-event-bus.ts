import type { PlatformEvent, PlatformEventBus, PlatformEventHandler, StampedPlatformEvent } from './platform-events.js';

export const PLATFORM_EVENTS_CHANNEL = 'meshify:platform-events';

/**
 * Structural Redis interfaces so this package stays ioredis-free (mirrors
 * packages/queues/src/job-events.ts). The publisher can share an existing
 * command connection; the subscriber needs a dedicated connection because
 * subscribe-mode Redis connections cannot issue commands.
 */
export interface RedisPublisherConnection {
	publish(channel: string, message: string): Promise<unknown>;
}

export interface RedisSubscriberConnection {
	subscribe(channel: string): Promise<unknown>;
	on(event: 'message', handler: (channel: string, message: string) => void): unknown;
}

export class RedisPlatformEventBus implements PlatformEventBus {
	private readonly handlers = new Set<PlatformEventHandler>();
	private subscribed = false;

	constructor(
		private readonly publisher: RedisPublisherConnection,
		private readonly subscriber?: RedisSubscriberConnection,
		private readonly now: () => Date = () => new Date()
	) {}

	async publish(event: PlatformEvent): Promise<void> {
		const stamped: StampedPlatformEvent = { ...event, at: this.now().toISOString() };
		await this.publisher.publish(PLATFORM_EVENTS_CHANNEL, JSON.stringify(stamped));
	}

	/** One Redis subscription fans out to every in-process handler. */
	subscribe(handler: PlatformEventHandler): () => void {
		if (!this.subscriber) throw new Error('RedisPlatformEventBus was constructed without a subscriber connection');
		if (!this.subscribed) {
			this.subscribed = true;
			void this.subscriber.subscribe(PLATFORM_EVENTS_CHANNEL);
			this.subscriber.on('message', (channel, message) => {
				if (channel !== PLATFORM_EVENTS_CHANNEL) return;
				let event: StampedPlatformEvent;
				try {
					event = JSON.parse(message) as StampedPlatformEvent;
				} catch {
					return; // a malformed message must not break the fan-out
				}
				for (const h of this.handlers) {
					try {
						h(event);
					} catch {
						// One bad handler must not starve the others.
					}
				}
			});
		}
		this.handlers.add(handler);
		return () => this.handlers.delete(handler);
	}
}
