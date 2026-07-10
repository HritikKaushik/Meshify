import type { PipelineJob, PipelineJobRepository } from '@meshify/data-access';

export class GetJobStatusUseCase {
	constructor(private readonly pipelineJobs: PipelineJobRepository) {}

	async execute(jobId: string): Promise<PipelineJob | undefined> {
		return this.pipelineJobs.findById(jobId);
	}
}
