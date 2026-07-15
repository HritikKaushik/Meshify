import type { JobEvent, JobEventSubscriber } from '@meshify/queues';
import type { JobEventStream } from '../application/job-event-stream.port.js';

/**
 * In-process fan-out from the single Redis subscription to per-project SSE
 * connections. Started once at boot; each SSE request subscribes to its
 * project's events and unsubscribes on disconnect. With N platform-api replicas,
 * each runs its own hub and receives every event via Redis, then serves only
 * its locally-connected clients — horizontal scaling with no sticky sessions.
 */
export class JobEventHub implements JobEventStream {
	private readonly listenersByProject = new Map<string, Set<(event: JobEvent) => void>>();

	constructor(private readonly subscriber: JobEventSubscriber) {}

	async start(): Promise<void> {
		this.subscriber.onEvent((event) => {
			const listeners = this.listenersByProject.get(event.projectId);
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
		await this.subscriber.start();
	}

	subscribe(projectId: string, listener: (event: JobEvent) => void): () => void {
		let listeners = this.listenersByProject.get(projectId);
		if (!listeners) {
			listeners = new Set();
			this.listenersByProject.set(projectId, listeners);
		}
		listeners.add(listener);
		return () => {
			const set = this.listenersByProject.get(projectId);
			if (!set) return;
			set.delete(listener);
			if (set.size === 0) this.listenersByProject.delete(projectId);
		};
	}
}
