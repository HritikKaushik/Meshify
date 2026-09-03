/**
 * Shared BullMQ job defaults.
 *
 * Retry envelope: 6 attempts with exponential backoff from 30s, i.e. waits of
 * 30s, 1m, 2m, 4m and 8m between tries (about 15.5 minutes end to end). That
 * rides through a multi-minute engine restart or a Redis/Qdrant blip instead
 * of dead-lettering the job after the 75 seconds the old 5 x 5s schedule gave.
 *
 * Retention: completed jobs are kept 24h for inspection. Failed jobs are the
 * dead-letter queue and are kept 30 days - bounded, where `removeOnFail: false`
 * grew the failed set forever. The pipeline_jobs row keeps the final error
 * text beyond that window.
 */
export const DEFAULT_JOB_OPTS = {
	attempts: 6,
	backoff: { type: 'exponential' as const, delay: 30_000 },
	removeOnComplete: { age: 24 * 60 * 60 },
	removeOnFail: { age: 30 * 24 * 60 * 60 },
};

/** Total wall-clock a job can spend retrying under DEFAULT_JOB_OPTS (sum of the backoff waits). */
export function retryEnvelopeMs(opts: { attempts: number; backoff: { delay: number } } = DEFAULT_JOB_OPTS): number {
	let total = 0;
	for (let attempt = 1; attempt < opts.attempts; attempt += 1) total += opts.backoff.delay * 2 ** (attempt - 1);
	return total;
}
