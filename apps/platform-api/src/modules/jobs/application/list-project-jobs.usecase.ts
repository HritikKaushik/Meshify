import type { PipelineJobRepository } from '@meshify/data-access';
import type { JobEvent } from '@meshify/queues';
import { pipelineJobToEvent } from '../domain/job-snapshot.js';

const RECENT_LIMIT = 30;

/**
 * The snapshot behind the Job Progress Center: a project's in-flight jobs (for
 * live tracking on first paint) plus its recent history. Both are returned in
 * the JobEvent wire shape so the client renders snapshot and live events
 * identically.
 */
export class ListProjectJobsUseCase {
	constructor(private readonly pipelineJobs: PipelineJobRepository) {}

	async execute(projectId: string): Promise<{ active: JobEvent[]; recent: JobEvent[] }> {
		const [active, recent] = await Promise.all([this.pipelineJobs.listActiveByProject(projectId), this.pipelineJobs.listRecentByProject(projectId, RECENT_LIMIT)]);
		return { active: active.map(pipelineJobToEvent), recent: recent.map(pipelineJobToEvent) };
	}
}
