import { describe, expect, it, vi } from 'vitest';
import type { PipelineJobRepository } from '@meshify/data-access';
import type { Queue } from 'bullmq';
import type { SlackSyncJobPayload } from '@meshify/queues';
import { InMemoryKnowledgeConnectorRepository, InMemorySlackWorkspaceRepository, buildKnowledgeConnector, buildSlackWorkspace } from '@meshify/testing';
import { SyncSlackUseCase } from './sync-slack.usecase.js';
import { SlackConnectorNotFoundError } from './slack-support.js';

function makeUseCase() {
	const connectors = new InMemoryKnowledgeConnectorRepository([buildKnowledgeConnector({ id: 'conn-1', type: 'slack' })]);
	const workspaces = new InMemorySlackWorkspaceRepository([buildSlackWorkspace({ id: 'ws-1', connectorId: 'conn-1' })]);
	const created: unknown[] = [];
	const pipelineJobs = { create: vi.fn(async (i) => (created.push(i), i)) } as unknown as PipelineJobRepository;
	const added: Array<{ payload: SlackSyncJobPayload; opts?: { jobId?: string } }> = [];
	const queue = { add: vi.fn(async (_n: string, payload: SlackSyncJobPayload, opts?: { jobId?: string }) => void added.push({ payload, opts })) } as unknown as Queue<SlackSyncJobPayload>;
	return { usecase: new SyncSlackUseCase(connectors, workspaces, pipelineJobs, queue), added, created };
}

describe('SyncSlackUseCase', () => {
	it('creates a slack_sync pipeline job and enqueues with a pinned jobId (BullMQ dedupe)', async () => {
		const { usecase, added, created } = makeUseCase();
		const result = await usecase.execute({ projectId: 'proj-1', connectorId: 'conn-1' });

		expect(created).toHaveLength(1);
		expect((created[0] as { jobType: string }).jobType).toBe('slack_sync');
		expect(added).toHaveLength(1);
		expect(added[0]!.payload).toMatchObject({ connectorId: 'conn-1', workspaceId: 'ws-1', projectId: 'proj-1' });
		// Idempotency: the BullMQ jobId is pinned to the pipeline_jobs row id.
		expect(added[0]!.opts?.jobId).toBe(result.jobId);
	});

	it('rejects a cross-project connector (tenant isolation)', async () => {
		const { usecase } = makeUseCase();
		await expect(usecase.execute({ projectId: 'other', connectorId: 'conn-1' })).rejects.toBeInstanceOf(SlackConnectorNotFoundError);
	});
});
