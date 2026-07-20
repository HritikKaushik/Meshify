import type { PlatformEventBus, StampedPlatformEvent } from '@meshify/providers';

/**
 * In-process fan-out from the platform event bus to per-org SSE connections
 * (mirrors JobEventHub's per-project shape). Each platform-api replica runs
 * its own hub over the shared Redis channel and serves only its
 * locally-connected clients — horizontal scaling with no sticky sessions.
 */
export class IntegrationEventHub {
	private readonly listenersByOrg = new Map<string, Set<(event: StampedPlatformEvent) => void>>();

	constructor(private readonly bus: PlatformEventBus) {}

	start(): void {
		this.bus.subscribe((event) => {
			const listeners = this.listenersByOrg.get(event.orgId);
			if (!listeners) return;
			for (const listener of listeners) {
				// One misbehaving SSE connection must not break delivery to the others.
				try {
					listener(event);
				} catch {
					/* ignore */
				}
			}
		});
	}

	subscribe(orgId: string, listener: (event: StampedPlatformEvent) => void): () => void {
		let listeners = this.listenersByOrg.get(orgId);
		if (!listeners) {
			listeners = new Set();
			this.listenersByOrg.set(orgId, listeners);
		}
		listeners.add(listener);
		return () => {
			const set = this.listenersByOrg.get(orgId);
			if (!set) return;
			set.delete(listener);
			if (set.size === 0) this.listenersByOrg.delete(orgId);
		};
	}
}
