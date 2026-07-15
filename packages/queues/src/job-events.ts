/**
 * Real-time job progress events, carried over Redis Pub/Sub so the worker
 * (producer) can push progress across the process boundary to platform-api
 * (which holds the browser SSE connections). This mirrors how the rest of this
 * package wraps BullMQ: the Redis coupling lives here, behind a small port, so
 * apps depend on the abstraction rather than ioredis directly.
 *
 * A single channel carries every project's events; platform-api filters by
 * projectId when fanning out to per-project SSE connections. With N platform-api
 * replicas, each subscribes and receives every event, then serves its own local
 * SSE clients — horizontal scaling with no sticky sessions.
 */

/** The Redis Pub/Sub channel all job progress events flow through. */
export const JOB_EVENTS_CHANNEL = 'meshify:jobs';

export type JobPhase = 'running' | 'progress' | 'completed' | 'failed' | 'retry';

export interface JobEvent {
	jobId: string;
	projectId: string;
	/** PipelineJobType as a string (kept loose so this package stays decoupled from data-access). */
	jobType: string;
	/** Human-readable subject, e.g. a filename, repo URL, or Slack workspace name. */
	title: string;
	phase: JobPhase;
	/** Current stage label while running, e.g. "Scanning repository". */
	stage?: string;
	/** Completion percent 0-100 (omit for indeterminate stages). */
	percent?: number;
	message?: string;
	attempt?: number;
	error?: string;
	/** ISO timestamp, stamped by the publisher. */
	at: string;
}

/** Minimal publisher surface — an ioredis `Redis` satisfies it, keeping this package ioredis-free. */
export interface RedisPublisherConnection {
	publish(channel: string, message: string): Promise<number>;
}

/** Minimal subscriber surface — a DEDICATED ioredis connection (subscribe mode) satisfies it. */
export interface RedisSubscriberConnection {
	subscribe(...channels: string[]): Promise<unknown>;
	on(event: 'message', listener: (channel: string, message: string) => void): unknown;
}

/** Publishes JobEvents to Redis. The `at` timestamp is stamped here so producers don't have to. */
export class JobEventPublisher {
	constructor(private readonly redis: RedisPublisherConnection) {}

	async publish(event: Omit<JobEvent, 'at'>): Promise<void> {
		const payload: JobEvent = { ...event, at: new Date().toISOString() };
		await this.redis.publish(JOB_EVENTS_CHANNEL, JSON.stringify(payload));
	}
}

/**
 * Subscribes once to the job-events channel and fans out parsed JobEvents to any
 * number of in-process handlers (e.g. the platform-api SSE hub). Requires a
 * dedicated ioredis connection — a subscriber connection cannot run other
 * commands.
 */
export class JobEventSubscriber {
	private readonly handlers = new Set<(event: JobEvent) => void>();
	private started = false;

	constructor(private readonly redis: RedisSubscriberConnection) {}

	async start(): Promise<void> {
		if (this.started) return;
		this.started = true;
		await this.redis.subscribe(JOB_EVENTS_CHANNEL);
		this.redis.on('message', (channel, message) => {
			if (channel !== JOB_EVENTS_CHANNEL) return;
			const event = safeParse(message);
			if (event) for (const handler of this.handlers) handler(event);
		});
	}

	/** Register a handler; returns an unsubscribe function. */
	onEvent(handler: (event: JobEvent) => void): () => void {
		this.handlers.add(handler);
		return () => this.handlers.delete(handler);
	}
}

function safeParse(message: string): JobEvent | undefined {
	try {
		return JSON.parse(message) as JobEvent;
	} catch {
		return undefined;
	}
}
