import type { JobEvent } from '@meshify/queues';

/**
 * Application-layer port over the live job-event source. The SSE controller
 * depends on this, not on the Redis-backed hub in infrastructure — so the
 * streaming endpoint stays testable with an in-memory stub.
 */
export interface JobEventStream {
	/** Subscribe to a project's live job events; returns an unsubscribe function. */
	subscribe(projectId: string, listener: (event: JobEvent) => void): () => void;
}
