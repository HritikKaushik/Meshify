import { describe, expect, it } from 'vitest';
import { executeSlackSync, type SlackSyncDeps } from './sync.js';
import { ConnectorEngine, type ContentLedger, type KnowledgeItem, type KnowledgeWriter, type SyncContext } from '../index.js';
import { buildIntegration, fakeVaultHandle, fakeRegistration } from '../testing/fakes.js';
import { FakeSlackClient } from '@meshify/slack';
import type { SlackChannel, SlackConversation, SlackWorkspace, UpsertSlackConversationInput } from '@meshify/data-access';

class RecordingWriter implements KnowledgeWriter {
	embedded: KnowledgeItem[] = [];
	deleted: string[] = [];
	async embed(_t: 'documents' | 'code', items: KnowledgeItem[]) {
		this.embedded.push(...items);
	}
	async deleteBySourceRefs(_t: 'documents' | 'code', refs: string[]) {
		this.deleted.push(...refs);
	}
}

class MapLedger implements ContentLedger {
	constructor(readonly hashes = new Map<string, string>()) {}
	async getHashes(_c: string, refs: string[]) {
		return new Map([...this.hashes].filter(([k]) => refs.includes(k)));
	}
	async setHashes(_c: string, entries: Array<{ sourceRef: string; contentHash: string }>) {
		for (const e of entries) this.hashes.set(e.sourceRef, e.contentHash);
	}
	async deleteRefs(_c: string, refs: string[]) {
		for (const r of refs) this.hashes.delete(r);
	}
}

const workspace: SlackWorkspace = {
	id: 'ws-1',
	connectorId: 'conn-1',
	projectId: 'proj-1',
	integrationId: 'int-1',
	teamId: 'T111',
	teamName: 'Acme',
	botUserId: 'U-bot',
	scope: null,
	encryptedAccessToken: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
};

function channel(id: string, channelId: string, name: string): SlackChannel {
	return { id, workspaceId: 'ws-1', projectId: 'proj-1', channelId, name, isPrivate: false, selected: true, createdAt: new Date(0), updatedAt: new Date(0) };
}

function syncCtx(mode: 'full' | 'incremental'): SyncContext {
	return {
		mode,
		integration: buildIntegration({ provider: 'slack', externalAccountId: 'T111' }),
		vault: fakeVaultHandle({ access_token: { value: 'xoxb-live' } }),
		registration: fakeRegistration({ provider: 'slack' }),
		connector: {
			id: 'conn-1',
			projectId: 'proj-1',
			type: 'slack',
			displayName: 'Acme',
			status: 'active',
			config: {},
			integrationId: 'int-1',
			syncPolicy: { trigger: 'event' },
			lastError: null,
			createdAt: new Date(0),
			updatedAt: new Date(0),
		},
		cursors: { get: async () => undefined, set: async () => undefined },
	};
}

function harness(opts: { channels: SlackChannel[]; slack: FakeSlackClient; cursorByChannel?: Record<string, string> }) {
	const conversations: SlackConversation[] = [];
	const cursors: Array<{ slackChannelId: string; lastSyncedTs: string | null }> = [];
	const deps: SlackSyncDeps = {
		workspaces: { findByConnectorId: async () => workspace },
		channels: { listSelectedByWorkspace: async () => opts.channels },
		conversations: {
			findByProjectAndKey: async (projectId, key) => conversations.find((c) => c.projectId === projectId && c.conversationKey === key),
			listByChannel: async (slackChannelId) => conversations.filter((c) => c.slackChannelId === slackChannelId),
			upsert: async (input: UpsertSlackConversationInput) => {
				const existingIdx = conversations.findIndex((c) => c.conversationKey === input.conversationKey);
				const row = { ...(conversations[existingIdx] ?? {}), ...input, status: 'pending', createdAt: new Date(0), updatedAt: new Date(0) } as SlackConversation;
				if (existingIdx >= 0) conversations[existingIdx] = row;
				else conversations.push(row);
				return row;
			},
		},
		syncState: {
			findByChannel: async (slackChannelId) => {
				const ts = opts.cursorByChannel?.[slackChannelId];
				return ts ? ({ id: 's', slackChannelId, projectId: 'proj-1', lastSyncedTs: ts, lastSyncedAt: null, createdAt: new Date(0), updatedAt: new Date(0) } as never) : undefined;
			},
			upsertCursor: async (input) => void cursors.push({ slackChannelId: input.slackChannelId, lastSyncedTs: input.lastSyncedTs }),
		},
		client: opts.slack,
		generateId: () => 'id-x',
	};
	const writer = new RecordingWriter();
	const engine = new ConnectorEngine(writer, new MapLedger());
	return { deps, writer, engine, conversations, cursors };
}

const provider = (deps: SlackSyncDeps) => ({ executeSync: (ctx: SyncContext, sink: never) => executeSlackSync(deps, ctx, sink) });

describe('executeSlackSync', () => {
	it('groups messages into conversation docs, embeds under slack/ source refs, and advances the cursor after the flush barrier', async () => {
		const slack = new FakeSlackClient({
			history: { C1: [{ ts: '100.000100', user: 'U1', text: 'hello world' }] },
			users: { U1: { id: 'U1', name: 'Ada' } },
		});
		const h = harness({ channels: [channel('ch-1', 'C1', 'general')], slack });

		const summary = await h.engine.execute(provider(h.deps) as never, syncCtx('full'));

		expect(summary.itemsUpserted).toBe(1);
		expect(h.writer.embedded[0]!.sourceRef.startsWith('slack/T111/')).toBe(true);
		expect(h.writer.embedded[0]!.target).toBe('documents');
		expect(h.conversations).toHaveLength(1);
		expect(h.cursors).toEqual([{ slackChannelId: 'ch-1', lastSyncedTs: '100.000100' }]);
	});

	it('isolates per-channel failures via scopeFailed and only fails when every channel fails', async () => {
		const slack = new FakeSlackClient({
			history: { C1: [{ ts: '100.000100', user: 'U1', text: 'hi' }] },
			users: { U1: { id: 'U1', name: 'Ada' } },
			historyErrors: { 'C-dead': 'not_in_channel' },
		});
		const h = harness({ channels: [channel('ch-1', 'C1', 'general'), channel('ch-2', 'C-dead', 'ops')], slack });

		const summary = await h.engine.execute(provider(h.deps) as never, syncCtx('full'));
		expect(summary.itemsUpserted).toBe(1);
		expect(summary.partialFailures).toEqual([{ scope: '#ops', error: expect.stringContaining('not_in_channel') }]);

		const allDead = harness({ channels: [channel('ch-2', 'C-dead', 'ops')], slack });
		await expect(allDead.engine.execute(provider(allDead.deps) as never, syncCtx('full'))).rejects.toThrow(/all 1 selected/);
	});

	it('requires a vault token — token-less workspaces fail with a reconnect message', async () => {
		const slack = new FakeSlackClient({});
		const h = harness({ channels: [], slack });
		const ctx = { ...syncCtx('full'), vault: fakeVaultHandle() };
		await expect(h.engine.execute(provider(h.deps) as never, ctx)).rejects.toThrow(/reconnect the integration/);
	});
});
