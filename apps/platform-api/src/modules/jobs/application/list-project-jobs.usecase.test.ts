import { describe, expect, it } from 'vitest';
import type { PipelineJob } from '@meshify/data-access';
import { InMemoryPipelineJobRepository } from '@meshify/testing';
import { ListProjectJobsUseCase } from './list-project-jobs.usecase.js';

function job(overrides: Partial<PipelineJob>): PipelineJob {
	return {
		id: 'j',
		projectId: 'proj-1',
		jobType: 'clone_repo',
		status: 'running',
		rocketrideToken: null,
		attempts: 0,
		lastError: null,
		payload: {},
		progress: null,
		stage: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		completedAt: null,
		...overrides,
	};
}

describe('ListProjectJobsUseCase', () => {
	it('returns active jobs and recent history mapped to the JobEvent wire shape', async () => {
		const repo = new InMemoryPipelineJobRepository([
			job({ id: 'running-1', status: 'running', progress: 40, stage: 'Scanning repository' }),
			job({ id: 'queued-1', status: 'queued' }),
			job({ id: 'done-1', status: 'completed', progress: 100 }),
			job({ id: 'failed-1', status: 'failed', jobType: 'slack_sync', lastError: 'not_in_channel' }),
			job({ id: 'other-project', projectId: 'proj-2', status: 'running' }),
		]);
		const result = await new ListProjectJobsUseCase(repo).execute('proj-1');

		// Active = queued + running only, and never another project's jobs.
		expect(result.active.map((e) => e.jobId).sort()).toEqual(['queued-1', 'running-1']);
		expect(result.active.every((e) => e.projectId === 'proj-1')).toBe(true);

		const running = result.active.find((e) => e.jobId === 'running-1')!;
		expect(running.phase).toBe('progress');
		expect(running.percent).toBe(40);
		expect(running.stage).toBe('Scanning repository');
		expect(running.title).toBe('Repository ingestion'); // generic per-type label

		// Recent history includes terminal jobs with the right phase + error.
		const failed = result.recent.find((e) => e.jobId === 'failed-1')!;
		expect(failed.phase).toBe('failed');
		expect(failed.error).toBe('not_in_channel');
		expect(failed.title).toBe('Slack sync');
	});
});
