import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { encryptSecret } from '@meshify/data-access';
import { FakeRagService } from '@meshify/rocketride-gateway';
import { FakeSlackClient, type FakeSlackSeed, type SlackMessage } from '@meshify/slack';
import { JobEventPublisher, type SlackIngestJobPayload } from '@meshify/queues';
import {
	InMemoryKnowledgeConnectorRepository,
	InMemoryPipelineJobRepository,
	InMemoryProjectRepository,
	InMemorySlackChannelRepository,
	InMemorySlackConversationRepository,
	InMemorySlackSyncStateRepository,
	InMemorySlackWorkspaceRepository,
	buildKnowledgeConnector,
	buildProject,
	buildSlackChannel,
	buildSlackWorkspace,
} from '@meshify/testing';
import { processSlackIngestJob } from './slack-ingest.processor.js';
import { processSlackSyncJob } from './slack-sync.processor.js';
import { ingestWorkspace, type SlackIngestionDeps } from '../slack/ingest-workspace.js';

const ENCRYPTION_KEY = 'a-test-encryption-key-at-least-32-chars!';
const noopJobEvents = new JobEventPublisher({ publish: async () => 0 });

function makeHarness(seed: FakeSlackSeed) {
	const slack = new FakeSlackClient(seed);
	const rag = new FakeRagService();
	const conversations = new InMemorySlackConversationRepository();
	const syncState = new InMemorySlackSyncStateRepository();
	const fetchHistorySpy = vi.spyOn(slack, 'fetchHistory');
	const vectors = { deleteBySourcePaths: vi.fn(async () => {}) };
	const deps: SlackIngestionDeps = {
		connectors: new InMemoryKnowledgeConnectorRepository([buildKnowledgeConnector({ id: 'conn-slack-1' })]),
		pipelineJobs: new InMemoryPipelineJobRepository(),
		jobEvents: noopJobEvents,
		slackWorkspaces: new InMemorySlackWorkspaceRepository([
			buildSlackWorkspace({ id: 'ws-1', connectorId: 'conn-slack-1', teamId: 'T123', encryptedAccessToken: encryptSecret(ENCRYPTION_KEY, 'xoxb-token') }),
		]),
		slackChannels: new InMemorySlackChannelRepository([buildSlackChannel({ id: 'chan-1', workspaceId: 'ws-1', channelId: 'C123', name: 'engineering', selected: true })]),
		slackConversations: conversations,
		slackSyncState: syncState,
		projects: new InMemoryProjectRepository({ projects: [buildProject({ id: 'proj-1' })] }),
		slack,
		rag,
		vectors,
		pipelineRegistry: { ensureIngestPipeline: vi.fn(async () => 'ingest-token') } as never,
		documentChunkSize: 768,
		qdrantHost: 'localhost',
		qdrantPort: 6333,
		encryptionKey: ENCRYPTION_KEY,
	};
	return { deps, rag, conversations, syncState, vectors, fetchHistorySpy };
}

function job(): Job<SlackIngestJobPayload> {
	return { data: { pipelineJobId: 'j', connectorId: 'conn-slack-1', workspaceId: 'ws-1', projectId: 'proj-1' }, attemptsMade: 0, opts: { attempts: 5 } } as unknown as Job<SlackIngestJobPayload>;
}

const SOURCE_PATH = 'slack/T123/C123/t100.0001';

describe('processSlackSyncJob (incremental)', () => {
	it('re-fetches an existing thread that got a new reply, purges stale vectors, and re-ingests (the thread-freeze bug)', async () => {
		const replies: SlackMessage[] = [
			{ ts: '100.0001', threadTs: '100.0001', user: 'U1', text: 'How do refunds retry?' },
			{ ts: '101.0002', threadTs: '100.0001', user: 'U2', text: 'Exponential backoff.' },
		];
		const seed: FakeSlackSeed = {
			channels: [{ id: 'C123', name: 'engineering', isPrivate: false }],
			history: { C123: [{ ts: '100.0001', threadTs: '100.0001', user: 'U1', text: 'How do refunds retry?' }] },
			replies: { 'C123:100.0001': replies },
			users: { U1: { id: 'U1', name: 'Ada' }, U2: { id: 'U2', name: 'Grace' } },
		};
		const { deps, rag, conversations, syncState, vectors, fetchHistorySpy } = makeHarness(seed);

		// 1) Initial full ingest → 1 conversation embedded, cursor at the last reply ts.
		await processSlackIngestJob(job(), deps);
		expect(rag.ingestCalls).toHaveLength(1);
		expect((await syncState.findByChannel('chan-1'))?.lastSyncedTs).toBe('101.0002');

		// 2) Incremental sync with no changes → thread re-fetched, content unchanged → skipped (no purge, no re-ingest).
		await processSlackSyncJob(job(), deps);
		expect(rag.ingestCalls).toHaveLength(1);
		expect(vectors.deleteBySourcePaths).not.toHaveBeenCalled();
		// Sync used the stored cursor as `oldest` (proves incremental, not full re-pull).
		expect(fetchHistorySpy.mock.calls.at(-1)?.[2]).toEqual({ oldest: '101.0002' });

		// 3) A new reply lands in the OLD thread (its parent ts stays below the cursor and never returns in history).
		replies.push({ ts: '200.0005', threadTs: '100.0001', user: 'U1', text: 'Confirmed, thanks.' });
		await processSlackSyncJob(job(), deps);

		// The thread is re-fetched via listByChannel, content changed → purge then re-ingest.
		expect(vectors.deleteBySourcePaths).toHaveBeenCalledWith('proj_1_documents', [SOURCE_PATH]);
		expect(rag.ingestCalls).toHaveLength(2);
		expect(rag.ingestCalls[1]!.files[0]!.buffer.toString('utf8')).toContain('Confirmed, thanks.');
		// Cursor advanced to the new reply ts; the conversation reflects the new message count.
		expect((await syncState.findByChannel('chan-1'))?.lastSyncedTs).toBe('200.0005');
		const conv = await conversations.findByProjectAndSourcePath('proj-1', SOURCE_PATH);
		expect(conv?.messageCount).toBe(3);
		expect(conv?.status).toBe('embedded');
	});

	it('is a no-op when a workspace has no selected channels', async () => {
		const { deps, rag } = makeHarness({});
		await deps.slackChannels.setSelected('ws-1', []); // deselect all
		await ingestWorkspace(deps, { connectorId: 'conn-slack-1', workspaceId: 'ws-1', projectId: 'proj-1' }, { incremental: true });
		expect(rag.ingestCalls).toHaveLength(0);
		expect(await deps.connectors.findById('conn-slack-1').then((c) => c?.status)).toBe('active');
	});
});
