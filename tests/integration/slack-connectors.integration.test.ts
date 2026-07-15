import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
	PostgresKnowledgeConnectorRepository,
	PostgresProjectRepository,
	PostgresSlackChannelRepository,
	PostgresSlackConversationRepository,
	PostgresSlackSyncStateRepository,
	PostgresSlackWorkspaceRepository,
	decryptSecret,
	encryptSecret,
	slackConversationKey,
	slackSourcePath,
} from '@meshify/data-access';

/**
 * Integration test against a REAL Postgres (the exact SQL + the 0009 schema +
 * cascade FKs). Exercises the new Slack/connector Postgres repositories end to
 * end — including the reconnect-token UPDATE and the connector→detail cascade —
 * inside a throwaway org/project that is deleted (cascade) in afterAll, so it
 * leaves no residue. Skips automatically when no migrated Postgres is reachable
 * (e.g. plain `pnpm test` on a laptop with the stack down).
 */
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://meshify:meshify@localhost:5433/meshify';
const KEY = 'integration-org-key-encryption-32chars!!';

let pool: pg.Pool | undefined;
let available = false;
const orgId = randomUUID();
const projectId = randomUUID();

let connectors: PostgresKnowledgeConnectorRepository;
let workspaces: PostgresSlackWorkspaceRepository;
let channels: PostgresSlackChannelRepository;
let conversations: PostgresSlackConversationRepository;
let syncState: PostgresSlackSyncStateRepository;

beforeAll(async () => {
	pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 2000, max: 2 });
	try {
		// Requires migration 0009 to have been applied.
		await pool.query('select 1 from slack_workspaces limit 1');
		available = true;
	} catch {
		available = false;
		await pool.end().catch(() => undefined);
		pool = undefined;
		return;
	}

	connectors = new PostgresKnowledgeConnectorRepository(pool);
	workspaces = new PostgresSlackWorkspaceRepository(pool);
	channels = new PostgresSlackChannelRepository(pool);
	conversations = new PostgresSlackConversationRepository(pool);
	syncState = new PostgresSlackSyncStateRepository(pool);

	await pool.query('insert into organizations (id, name) values ($1, $2)', [orgId, `itest-${orgId}`]);
	await new PostgresProjectRepository(pool).create({
		id: projectId,
		orgId,
		name: 'itest-project',
		description: null,
		llmProfile: 'openai-5',
		embeddingProfile: 'openai-embed-3',
		qdrantCollectionDocs: `itest_${projectId.replace(/-/g, '')}_documents`,
		qdrantCollectionCode: `itest_${projectId.replace(/-/g, '')}_code`,
		rocketrideDocsIngestPipelineId: randomUUID(),
		rocketrideCodeIngestPipelineId: randomUUID(),
		rocketrideChatPipelineId: randomUUID(),
	});
});

afterAll(async () => {
	if (pool) {
		if (available) await pool.query('delete from organizations where id = $1', [orgId]).catch(() => undefined);
		await pool.end().catch(() => undefined);
	}
});

describe('Slack connector repositories (Postgres integration)', () => {
	it('round-trips a slack connector + workspace, and updateAccessToken replaces the stored token', async (ctx) => {
		if (!available) return ctx.skip();

		const connector = await connectors.create({ id: randomUUID(), projectId, type: 'slack', displayName: 'Acme', status: 'active', config: { teamId: 'T1' } });
		const ws = await workspaces.create({
			id: randomUUID(),
			connectorId: connector.id,
			projectId,
			teamId: 'T1',
			teamName: 'Acme',
			encryptedAccessToken: encryptSecret(KEY, 'xoxb-old'),
		});

		expect((await workspaces.findByConnectorId(connector.id))?.id).toBe(ws.id);
		expect((await workspaces.findByProjectAndTeam(projectId, 'T1'))?.id).toBe(ws.id);

		// The reconnect-token fix: UPDATE replaces the encrypted token in place.
		await workspaces.updateAccessToken(ws.id, encryptSecret(KEY, 'xoxb-new'), { scope: 'channels:history', botUserId: 'B9' });
		const refreshed = await workspaces.findById(ws.id);
		expect(decryptSecret(KEY, refreshed!.encryptedAccessToken)).toBe('xoxb-new');
		expect(refreshed!.botUserId).toBe('B9');
	});

	it('upserts channels (preserving selection) and setSelected/listSelected work', async (ctx) => {
		if (!available) return ctx.skip();
		const connector = await connectors.create({ id: randomUUID(), projectId, type: 'slack', displayName: 'C', status: 'active' });
		const ws = await workspaces.create({ id: randomUUID(), connectorId: connector.id, projectId, teamId: 'T2', encryptedAccessToken: encryptSecret(KEY, 't') });

		await channels.upsert({ id: randomUUID(), workspaceId: ws.id, projectId, channelId: 'C1', name: 'general' });
		await channels.upsert({ id: randomUUID(), workspaceId: ws.id, projectId, channelId: 'C2', name: 'random' });
		await channels.setSelected(ws.id, ['C1']);

		// Re-upsert C1 (metadata refresh) must NOT clear its selection.
		await channels.upsert({ id: randomUUID(), workspaceId: ws.id, projectId, channelId: 'C1', name: 'general-renamed' });
		const selected = await channels.listSelectedByWorkspace(ws.id);
		expect(selected.map((c) => c.channelId)).toEqual(['C1']);
		expect((await channels.listByWorkspace(ws.id)).find((c) => c.channelId === 'C1')?.name).toBe('general-renamed');
	});

	it('upserts a conversation, resolves it by source_path, and aggregates stats + listByChannel', async (ctx) => {
		if (!available) return ctx.skip();
		const connector = await connectors.create({ id: randomUUID(), projectId, type: 'slack', displayName: 'S', status: 'active' });
		const ws = await workspaces.create({ id: randomUUID(), connectorId: connector.id, projectId, teamId: 'T3', encryptedAccessToken: encryptSecret(KEY, 't') });
		const channel = await channels.upsert({ id: randomUUID(), workspaceId: ws.id, projectId, channelId: 'C9', name: 'eng' });

		const key = slackConversationKey('C9', 't100');
		const sourcePath = slackSourcePath('T3', key);
		const conv = await conversations.upsert({
			id: randomUUID(),
			projectId,
			workspaceId: ws.id,
			slackChannelId: channel.id,
			channelId: 'C9',
			channelName: 'eng',
			conversationKey: key,
			sourcePath,
			threadTs: 't100',
			tsStart: '100.0001',
			tsEnd: '101.0002',
			permalink: 'https://acme.slack.com/p1',
			participants: [{ id: 'U1', name: 'Ada' }],
			messageCount: 2,
			reactionCount: 1,
			visibility: 'public',
			contentHash: 'h1',
		});
		await conversations.updateStatus(conv.id, 'embedded');

		const found = await conversations.findByProjectAndSourcePath(projectId, sourcePath);
		expect(found?.channelName).toBe('eng');
		expect(found?.participants).toEqual([{ id: 'U1', name: 'Ada' }]);

		// Cursor round-trip.
		await syncState.upsertCursor({ id: randomUUID(), slackChannelId: channel.id, projectId, lastSyncedTs: '101.0002' });
		expect((await syncState.findByChannel(channel.id))?.lastSyncedTs).toBe('101.0002');

		const stats = await conversations.statsByWorkspace(ws.id);
		expect(stats.total).toBe(1);
		expect(stats.embedded).toBe(1);
		expect((await conversations.listByChannel(channel.id)).map((c) => c.conversationKey)).toEqual([key]);
	});

	it('deleting the connector cascades away its workspace, channels and conversations (0009 FKs)', async (ctx) => {
		if (!available) return ctx.skip();
		const connector = await connectors.create({ id: randomUUID(), projectId, type: 'slack', displayName: 'X', status: 'active' });
		const ws = await workspaces.create({ id: randomUUID(), connectorId: connector.id, projectId, teamId: 'T4', encryptedAccessToken: encryptSecret(KEY, 't') });
		const channel = await channels.upsert({ id: randomUUID(), workspaceId: ws.id, projectId, channelId: 'C4', name: 'c4' });
		await conversations.upsert({
			id: randomUUID(),
			projectId,
			workspaceId: ws.id,
			slackChannelId: channel.id,
			channelId: 'C4',
			conversationKey: slackConversationKey('C4', 'w1'),
			sourcePath: slackSourcePath('T4', slackConversationKey('C4', 'w1')),
			participants: [],
			messageCount: 1,
			reactionCount: 0,
			visibility: 'public',
			contentHash: 'h',
		});

		await connectors.delete(connector.id);

		expect(await workspaces.findById(ws.id)).toBeUndefined();
		expect(await channels.listByWorkspace(ws.id)).toHaveLength(0);
		expect(await conversations.listByWorkspace(ws.id)).toHaveLength(0);
	});
});
