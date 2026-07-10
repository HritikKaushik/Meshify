import { Router } from 'express';
import type { GetJobStatusUseCase } from '../application/get-job-status.usecase.js';

export function createJobsController(deps: { getJobStatus: GetJobStatusUseCase }): Router {
	const router = Router();

	router.get('/v1/jobs/:jobId', async (req, res) => {
		const job = await deps.getJobStatus.execute(req.params.jobId as string, req.auth!.orgId);
		if (!job) {
			res.status(404).json({ error: `Job "${req.params.jobId}" not found` });
			return;
		}

		res.status(200).json({
			id: job.id,
			projectId: job.projectId,
			jobType: job.jobType,
			status: job.status,
			attempts: job.attempts,
			lastError: job.lastError,
			createdAt: job.createdAt.toISOString(),
			updatedAt: job.updatedAt.toISOString(),
			completedAt: job.completedAt?.toISOString() ?? null,
		});
	});

	return router;
}
