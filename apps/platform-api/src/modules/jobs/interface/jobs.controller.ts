import type { Router } from 'express';
import { createRouter } from '../../../http/router.js';
import type { JobEvent } from '@meshify/queues';
import type { GetProjectUseCase } from '../../projects/application/get-project.usecase.js';
import { projectIsolationGuard } from '../../projects/interface/project-isolation.guard.js';
import { requireUuidParams } from '../../../http/require-uuid-params.js';
import type { GetJobStatusUseCase } from '../application/get-job-status.usecase.js';
import type { ListProjectJobsUseCase } from '../application/list-project-jobs.usecase.js';
import type { JobEventStream } from '../application/job-event-stream.port.js';

const SSE_HEARTBEAT_MS = 15_000;

export function createJobsController(deps: {
	getProject: GetProjectUseCase;
	getJobStatus: GetJobStatusUseCase;
	listProjectJobs: ListProjectJobsUseCase;
	jobEventStream: JobEventStream;
}): Router {
	const router = createRouter();
	const guard = projectIsolationGuard(deps.getProject);

	// Single job status (back-compat; org-scoped).
	router.get('/v1/jobs/:jobId', requireUuidParams('jobId'), async (req, res) => {
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
			progress: job.progress,
			stage: job.stage,
			attempts: job.attempts,
			lastError: job.lastError,
			createdAt: job.createdAt.toISOString(),
			updatedAt: job.updatedAt.toISOString(),
			completedAt: job.completedAt?.toISOString() ?? null,
		});
	});

	// Snapshot: a project's active jobs + recent history (first paint / SSE fallback).
	router.get('/v1/projects/:projectId/jobs', guard, async (req, res) => {
		const snapshot = await deps.listProjectJobs.execute(req.project!.id);
		res.status(200).json(snapshot);
	});

	// Real-time stream: an initial active-jobs snapshot, then live JobEvents for this project.
	router.get('/v1/projects/:projectId/jobs/stream', guard, async (req, res) => {
		const projectId = req.project!.id;

		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			// Defeat proxy/ingress response buffering so events flush immediately.
			'X-Accel-Buffering': 'no',
		});
		res.flushHeaders?.();

		const write = (event: JobEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);

		// Seed with the current in-flight jobs so a mid-job (re)connect shows progress instantly.
		const { active } = await deps.listProjectJobs.execute(projectId);
		for (const job of active) write(job);

		const unsubscribe = deps.jobEventStream.subscribe(projectId, write);
		const heartbeat = setInterval(() => res.write(': keepalive\n\n'), SSE_HEARTBEAT_MS);

		req.on('close', () => {
			clearInterval(heartbeat);
			unsubscribe();
		});
	});

	return router;
}
