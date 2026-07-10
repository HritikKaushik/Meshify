/** Shared BullMQ job defaults: 5 attempts, exponential backoff, failed jobs kept as the DLQ. */
export const DEFAULT_JOB_OPTS = {
	attempts: 5,
	backoff: { type: 'exponential' as const, delay: 5000 },
	removeOnComplete: { age: 24 * 60 * 60 },
	removeOnFail: false as const,
};
