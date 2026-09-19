import type { Router } from 'express';
import { createRouter } from '../../../http/router.js';
import { forbiddenBody, type Authorizer } from '../../security/authorization/authorizer.js';
import { authenticatedOnly } from '../../../http/route-policy.js';
import type { JobEvent } from '@meshify/queues';
import { requireUuidParams } from '../../../http/require-uuid-params.js';
import type { GetJobStatusUseCase } from '../application/get-job-status.usecase.js';
import type { ListProjectJobsUseCase } from '../application/list-project-jobs.usecase.js';
import type { JobEventStream } from '../application/job-event-stream.port.js';

const SSE_HEARTBEAT_MS = 15_000;

export function createJobsController(deps: {
	authz: Authorizer;
	getJobStatus: GetJobStatusUseCase;
	listProjectJobs: ListProjectJobsUseCase;
	jobEventStream: JobEventStream;
}): Router {
	const router = createRouter();
	const { authorize } = deps.authz;

	// Single job status (back-compat; org-scoped).
	router.get('/v1/jobs/:jobId', authenticatedOnly('the job names its project; jobs:read is checked on it once it is loaded'), requireUuidParams('jobId'), async (req, res) => {
		const job = await deps.getJobStatus.execute(req.params.jobId as string, req.auth!.orgId);
		// A job in a project the caller cannot see must look exactly like no job at all.
		const access = job ? await deps.authz.checkProjectById(req, job.projectId, 'jobs:read') : 'hidden';
		if (!job || access === 'hidden') {
			res.status(404).json({ error: `Job "${req.params.jobId}" not found` });
			return;
		}
		if (access === 'forbidden') {
			res.status(403).json(forbiddenBody('jobs:read'));
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
	router.get('/v1/projects/:projectId/jobs', authorize('jobs:read'), async (req, res) => {
		const snapshot = await deps.listProjectJobs.execute(req.project!.id);
		res.status(200).json(snapshot);
	});

	// Real-time stream: an initial active-jobs snapshot, then live JobEvents for this project.
	router.get('/v1/projects/:projectId/jobs/stream', authorize('jobs:read'), async (req, res) => {
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
