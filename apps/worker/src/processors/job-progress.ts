import type { PipelineJobRepository, PipelineJobType } from '@meshify/data-access';
import type { JobEventPublisher, JobPhase } from '@meshify/queues';

/**
 * Reports a job's live progress two ways at once: persisting the current
 * stage/percent to `pipeline_jobs` (so a client that connects mid-job reads the
 * current state) and publishing a JobEvent to Redis Pub/Sub (so connected
 * clients update in real time). Every emission is best-effort — progress
 * reporting must never fail or slow down the actual work.
 */
export class JobProgress {
	private title: string;

	constructor(
		private readonly pipelineJobs: PipelineJobRepository,
		private readonly publisher: JobEventPublisher,
		private readonly ctx: { jobId: string; projectId: string; jobType: PipelineJobType; title: string }
	) {
		this.title = ctx.title;
	}

	/** Refine the display title once the underlying entity is loaded (e.g. a filename or repo URL). */
	setTitle(title: string): void {
		this.title = title;
	}

	async running(stage = 'Starting'): Promise<void> {
		await this.publish('running', { stage, percent: 0 });
	}

	/** Report the current stage + completion percent (0-100). Persists and publishes. */
	async stage(stage: string, percent: number): Promise<void> {
		await this.pipelineJobs.updateProgress(this.ctx.jobId, { stage, percent }).catch(() => undefined);
		await this.publish('progress', { stage, percent });
	}

	async completed(): Promise<void> {
		await this.publish('completed', { percent: 100 });
	}

	async failed(isFinalAttempt: boolean, error: string, attempt: number): Promise<void> {
		await this.publish(isFinalAttempt ? 'failed' : 'retry', { error, attempt });
	}

	private async publish(phase: JobPhase, extra: { stage?: string; percent?: number; error?: string; attempt?: number }): Promise<void> {
		await this.publisher
			.publish({ jobId: this.ctx.jobId, projectId: this.ctx.projectId, jobType: this.ctx.jobType, title: this.title, phase, ...extra })
			.catch(() => undefined);
	}
}
