import type { Job } from 'bullmq';
import type { PipelineJobRepository } from '@meshify/data-access';

/**
 * The shared BullMQ job lifecycle: mark the pipeline_jobs row running, run the
 * work, mark it completed — and on failure record the attempt, dead-letter on
 * the final try, then rethrow so BullMQ applies its own retry/backoff. This is
 * the block duplicated across the document/repo/repo-sync processors; the Slack
 * processors are its first clean consumer (the others can adopt it later without
 * behavior change).
 *
 * `onError` lets a processor flip its own domain status (e.g. connector →
 * 'error') before the job is marked failed; its own failure is swallowed so it
 * can never mask the original error.
 */
export async function runPipelineJob<T>(
	job: Job<T>,
	pipelineJobId: string,
	pipelineJobs: PipelineJobRepository,
	work: () => Promise<void>,
	onError?: (message: string) => Promise<void>
): Promise<void> {
	await pipelineJobs.markRunning(pipelineJobId);
	try {
		await work();
		await pipelineJobs.markCompleted(pipelineJobId);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (onError) await onError(message).catch(() => undefined);

		await pipelineJobs.incrementAttempts(pipelineJobId);
		// job.attemptsMade is BullMQ's 1-indexed counter for this run — trust it over a separate count.
		const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
		await pipelineJobs.markFailed(pipelineJobId, message, isFinalAttempt ? 'dead_letter' : 'failed');

		throw err;
	}
}
