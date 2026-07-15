import { describe, expect, it, vi } from 'vitest';
import type { PipelineJobRepository } from '@meshify/data-access';
import type { Queue } from 'bullmq';
import type { SlackIngestJobPayload } from '@meshify/queues';
import {
	InMemoryKnowledgeConnectorRepository,
	InMemorySlackChannelRepository,
	InMemorySlackWorkspaceRepository,
	buildKnowledgeConnector,
	buildSlackChannel,
	buildSlackWorkspace,
} from '@meshify/testing';
import { SelectSlackChannelsUseCase } from './select-slack-channels.usecase.js';
import { SlackConnectorNotFoundError } from './slack-support.js';

function makeUseCase() {
	const connectors = new InMemoryKnowledgeConnectorRepository([buildKnowledgeConnector({ id: 'conn-slack-1', type: 'slack' })]);
	const workspaces = new InMemorySlackWorkspaceRepository([buildSlackWorkspace({ id: 'ws-1', connectorId: 'conn-slack-1' })]);
	const channels = new InMemorySlackChannelRepository([
		buildSlackChannel({ id: 'ch-1', workspaceId: 'ws-1', channelId: 'C1', selected: false }),
		buildSlackChannel({ id: 'ch-2', workspaceId: 'ws-1', channelId: 'C2', selected: false }),
	]);
	const pipelineJobs = { create: vi.fn(async (i) => i) } as unknown as PipelineJobRepository;
	const added: Array<{ payload: SlackIngestJobPayload; opts?: { jobId?: string } }> = [];
	const queue = { add: vi.fn(async (_n: string, payload: SlackIngestJobPayload, opts?: { jobId?: string }) => void added.push({ payload, opts })) } as unknown as Queue<SlackIngestJobPayload>;
	return { usecase: new SelectSlackChannelsUseCase(connectors, workspaces, channels, pipelineJobs, queue), channels, added };
}

describe('SelectSlackChannelsUseCase', () => {
	it('persists the selection and enqueues an ingest job with a pinned jobId', async () => {
		const { usecase, channels, added } = makeUseCase();

		const result = await usecase.execute({ projectId: 'proj-1', connectorId: 'conn-slack-1', channelIds: ['C1'] });

		const selected = await channels.listSelectedByWorkspace('ws-1');
		expect(selected.map((c) => c.channelId)).toEqual(['C1']);
		expect(added).toHaveLength(1);
		expect(added[0]!.payload.connectorId).toBe('conn-slack-1');
		expect(added[0]!.opts?.jobId).toBe(result.jobId);
	});

	it('rejects an unknown / cross-project connector', async () => {
		const { usecase } = makeUseCase();
		await expect(usecase.execute({ projectId: 'other', connectorId: 'conn-slack-1', channelIds: [] })).rejects.toBeInstanceOf(SlackConnectorNotFoundError);
	});
});
