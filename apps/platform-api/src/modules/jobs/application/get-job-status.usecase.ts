import type { PipelineJob, PipelineJobRepository } from '@meshify/data-access';

export class GetJobStatusUseCase {
	constructor(private readonly pipelineJobs: PipelineJobRepository) {}

	/** Org-scoped: a job in another org is indistinguishable from a missing one. */
	async execute(jobId: string, orgId: string): Promise<PipelineJob | undefined> {
		return this.pipelineJobs.findByIdForOrg(jobId, orgId);
	}
}
