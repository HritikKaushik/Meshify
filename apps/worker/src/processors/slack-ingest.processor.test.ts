import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { encryptSecret } from '@meshify/data-access';
import { FakeRagService } from '@meshify/rocketride-gateway';
import { FakeSlackClient } from '@meshify/slack';
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
import type { SlackIngestProcessorDeps } from './slack-ingest.processor.js';

const ENCRYPTION_KEY = 'a-test-encryption-key-at-least-32-chars!';

/** A no-op JobEventPublisher (progress events aren't asserted here). */
const noopJobEvents = new JobEventPublisher({ publish: async () => 0 });

function makeDeps(slack: FakeSlackClient): { deps: SlackIngestProcessorDeps; rag: FakeRagService; conversations: InMemorySlackConversationRepository; syncState: InMemorySlackSyncStateRepository } {
	const rag = new FakeRagService();
	const conversations = new InMemorySlackConversationRepository();
	const syncState = new InMemorySlackSyncStateRepository();
	const deps: SlackIngestProcessorDeps = {
		connectors: new InMemoryKnowledgeConnectorRepository([buildKnowledgeConnector({ id: 'conn-slack-1' })]),
		pipelineJobs: new InMemoryPipelineJobRepository(),
		jobEvents: noopJobEvents,
		slackWorkspaces: new InMemorySlackWorkspaceRepository([buildSlackWorkspace({ id: 'ws-1', connectorId: 'conn-slack-1', teamId: 'T123', encryptedAccessToken: encryptSecret(ENCRYPTION_KEY, 'xoxb-token') })]),
		slackChannels: new InMemorySlackChannelRepository([buildSlackChannel({ id: 'chan-1', workspaceId: 'ws-1', channelId: 'C123', name: 'engineering', selected: true })]),
		slackConversations: conversations,
		slackSyncState: syncState,
		projects: new InMemoryProjectRepository({ projects: [buildProject({ id: 'proj-1' })] }),
		slack,
		rag,
		vectors: { deleteBySourcePaths: vi.fn(async () => {}) },
		pipelineRegistry: { ensureIngestPipeline: vi.fn(async () => 'ingest-token') } as never,
		documentChunkSize: 768,
		qdrantHost: 'localhost',
		qdrantPort: 6333,
		encryptionKey: ENCRYPTION_KEY,
	};
	return { deps, rag, conversations, syncState };
}

function makeJob(): Job<SlackIngestJobPayload> {
	return { data: { pipelineJobId: 'job-1', connectorId: 'conn-slack-1', workspaceId: 'ws-1', projectId: 'proj-1' }, attemptsMade: 0, opts: { attempts: 5 } } as unknown as Job<SlackIngestJobPayload>;
}

describe('processSlackIngestJob', () => {
	it('groups a channel thread into one conversation document, ingests it, and advances the sync cursor', async () => {
		const slack = new FakeSlackClient({
			channels: [{ id: 'C123', name: 'engineering', isPrivate: false }],
			history: { C123: [{ ts: '100.0001', threadTs: '100.0001', user: 'U1', text: 'How do refunds retry?' }] },
			replies: {
				'C123:100.0001': [
					{ ts: '100.0001', threadTs: '100.0001', user: 'U1', text: 'How do refunds retry?' },
					{ ts: '101.0002', threadTs: '100.0001', user: 'U2', text: 'Exponential backoff.' },
				],
			},
			users: { U1: { id: 'U1', name: 'Ada' }, U2: { id: 'U2', name: 'Grace' } },
		});
		const { deps, rag, conversations, syncState } = makeDeps(slack);

		await processSlackIngestJob(makeJob(), deps);

		// One conversation document (the thread), not one per message.
		expect(rag.ingestCalls).toHaveLength(1);
		const ingested = rag.ingestCalls[0]!.files;
		expect(ingested).toHaveLength(1);
		expect(ingested[0]!.path).toBe('slack/T123/C123/t100.0001');
		expect(ingested[0]!.buffer.toString('utf8')).toContain('Exponential backoff.');

		// Metadata persisted for citations.
		const stored = await conversations.findByProjectAndSourcePath('proj-1', 'slack/T123/C123/t100.0001');
		expect(stored?.status).toBe('embedded');
		expect(stored?.channelName).toBe('engineering');
		expect(stored?.messageCount).toBe(2);
		expect(stored?.permalink).toContain('C123');

		// Cursor advanced to the newest message ts.
		expect((await syncState.findByChannel('chan-1'))?.lastSyncedTs).toBe('101.0002');
	});

	it('skips a channel the bot is not in (not_in_channel) and still ingests the accessible ones', async () => {
		const slack = new FakeSlackClient({
			history: { COK: [{ ts: '10.0001', user: 'U1', text: 'hello from the accessible channel' }] },
			historyErrors: { CBAD: 'not_in_channel' },
			users: { U1: { id: 'U1', name: 'Ada' } },
		});
		const connectors = new InMemoryKnowledgeConnectorRepository([buildKnowledgeConnector({ id: 'conn-slack-1' })]);
		const rag = new FakeRagService();
		const deps: SlackIngestProcessorDeps = {
			connectors,
			pipelineJobs: new InMemoryPipelineJobRepository(),
			jobEvents: noopJobEvents,
			slackWorkspaces: new InMemorySlackWorkspaceRepository([buildSlackWorkspace({ id: 'ws-1', connectorId: 'conn-slack-1', teamId: 'T1', encryptedAccessToken: encryptSecret(ENCRYPTION_KEY, 'xoxb') })]),
			slackChannels: new InMemorySlackChannelRepository([
				buildSlackChannel({ id: 'c-ok', workspaceId: 'ws-1', channelId: 'COK', name: 'ok', selected: true }),
				buildSlackChannel({ id: 'c-bad', workspaceId: 'ws-1', channelId: 'CBAD', name: 'bad', selected: true }),
			]),
			slackConversations: new InMemorySlackConversationRepository(),
			slackSyncState: new InMemorySlackSyncStateRepository(),
			projects: new InMemoryProjectRepository({ projects: [buildProject({ id: 'proj-1' })] }),
			slack,
			rag,
			vectors: { deleteBySourcePaths: vi.fn(async () => {}) },
			pipelineRegistry: { ensureIngestPipeline: vi.fn(async () => 'tok') } as never,
			documentChunkSize: 768,
			qdrantHost: 'h',
			qdrantPort: 6333,
			encryptionKey: ENCRYPTION_KEY,
		};

		await processSlackIngestJob(makeJob(), deps); // must NOT throw despite the inaccessible channel

		expect(rag.ingestCalls).toHaveLength(1); // only the accessible channel ingested
		const connector = await connectors.findById('conn-slack-1');
		expect(connector?.status).toBe('active'); // still usable
		expect(connector?.lastError).toContain('not_in_channel'); // the skip is recorded as a warning
	});

	it('fails the job only when EVERY selected channel is inaccessible', async () => {
		const slack = new FakeSlackClient({ historyErrors: { C123: 'not_in_channel' } });
		const { deps } = makeDeps(slack); // makeDeps seeds a single selected channel C123
		await expect(processSlackIngestJob(makeJob(), deps)).rejects.toThrow(/all 1 selected channel/);
	});

	it('skips an unchanged conversation on a second run (idempotent, no re-ingest)', async () => {
		const slack = new FakeSlackClient({
			channels: [{ id: 'C123', name: 'engineering', isPrivate: false }],
			history: { C123: [{ ts: '100.0001', user: 'U1', text: 'standalone note' }] },
			users: { U1: { id: 'U1', name: 'Ada' } },
		});
		const { deps, rag } = makeDeps(slack);

		await processSlackIngestJob(makeJob(), deps);
		await processSlackIngestJob(makeJob(), deps);

		// Second run finds the content hash unchanged and does not re-ingest.
		expect(rag.ingestCalls).toHaveLength(1);
	});
});
