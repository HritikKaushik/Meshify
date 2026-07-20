import { slackConversationKey, slackSourcePath } from '@meshify/data-access';
import type { SlackChannel, SlackConversation, SlackSyncState, SlackWorkspace, UpsertSlackConversationInput } from '@meshify/data-access';
import type { SlackClient } from '@meshify/slack';
import type { KnowledgeSink } from '../base/knowledge.js';
import type { SyncContext } from '../base/sync.js';
import { ProviderAuthError, ProviderConfigError } from '../base/errors.js';
import { groupConversations } from './conversation-grouper.js';

/** Detail persistence the sync needs — structural subsets of the data-access ports, wired by the worker. */
export interface SlackSyncDeps {
	workspaces: { findByConnectorId(connectorId: string): Promise<SlackWorkspace | undefined> };
	channels: { listSelectedByWorkspace(workspaceId: string): Promise<SlackChannel[]> };
	conversations: {
		findByProjectAndKey(projectId: string, conversationKey: string): Promise<SlackConversation | undefined>;
		listByChannel(slackChannelId: string): Promise<SlackConversation[]>;
		upsert(input: UpsertSlackConversationInput): Promise<SlackConversation>;
	};
	syncState: {
		findByChannel(slackChannelId: string): Promise<SlackSyncState | undefined>;
		upsertCursor(input: { id: string; slackChannelId: string; projectId: string; lastSyncedTs: string | null }): Promise<unknown>;
	};
	client: SlackClient;
	generateId: () => string;
}

/**
 * Slack content sync behind SyncCapable: pull each selected channel's history,
 * group into conversation documents (the embedding unit), and push them
 * through the sink — the ConnectorEngine owns skip/purge/embed bookkeeping.
 * Tokens come exclusively from the integration's vault; per-channel failures
 * degrade to scopeFailed (a channel the bot left must not kill the sync), and
 * each channel's cursor commits only after its content clears the flush barrier.
 */
export async function executeSlackSync(deps: SlackSyncDeps, ctx: SyncContext, sink: KnowledgeSink): Promise<void> {
	const workspace = await deps.workspaces.findByConnectorId(ctx.connector.id);
	if (!workspace) throw new ProviderConfigError(`Connector "${ctx.connector.id}" has no Slack workspace row`);

	const token = await ctx.vault.get('access_token');
	if (!token) throw new ProviderAuthError('This Slack workspace has no usable token — reconnect the integration');

	sink.progress('Loading channels', 10);
	const channels = await deps.channels.listSelectedByWorkspace(workspace.id);
	if (channels.length === 0) return;

	const userNames = new Map<string, string>();
	let failed = 0;

	for (let i = 0; i < channels.length; i++) {
		const channel = channels[i]!;
		sink.progress(`Processing #${channel.name ?? channel.channelId} (${i + 1}/${channels.length})`, 15 + Math.round((i / channels.length) * 80));
		try {
			await syncChannel(deps, ctx, sink, { workspace, channel, token: token.value, userNames });
		} catch (err) {
			failed += 1;
			sink.scopeFailed(`#${channel.name ?? channel.channelId}`, err instanceof Error ? err.message : String(err));
		}
	}

	if (failed === channels.length) {
		throw new Error(`Slack sync failed for all ${channels.length} selected channel(s) — is the bot a member?`);
	}
}

async function syncChannel(
	deps: SlackSyncDeps,
	ctx: SyncContext,
	sink: KnowledgeSink,
	scope: { workspace: SlackWorkspace; channel: SlackChannel; token: string; userNames: Map<string, string> }
): Promise<void> {
	const { workspace, channel, token, userNames } = scope;
	const projectId = ctx.connector.projectId;

	let oldest: string | undefined;
	if (ctx.mode === 'incremental') {
		const state = await deps.syncState.findByChannel(channel.id);
		oldest = state?.lastSyncedTs ?? undefined;
	}

	const history = await deps.client.fetchHistory(token, channel.channelId, { oldest });

	// conversations.history returns thread parents but not replies — pull replies per parent.
	const collected = new Map<string, (typeof history)[number]>();
	for (const message of history) {
		collected.set(message.ts, message);
		if (message.threadTs && Number(message.threadTs) === Number(message.ts)) {
			for (const reply of await deps.client.fetchReplies(token, channel.channelId, message.threadTs)) collected.set(reply.ts, reply);
		}
	}

	// Incremental: a reply to an OLD thread never resurfaces in history (the
	// parent ts sits below the cursor), so re-fetch replies for stored threads;
	// the content-hash skip suppresses the unchanged ones.
	if (ctx.mode === 'incremental') {
		const storedThreads = (await deps.conversations.listByChannel(channel.id)).filter((c) => c.threadTs && c.status !== 'deleted');
		for (const conversation of storedThreads) {
			if (collected.has(conversation.threadTs!)) continue;
			for (const reply of await deps.client.fetchReplies(token, channel.channelId, conversation.threadTs!)) collected.set(reply.ts, reply);
		}
	}

	const messages = [...collected.values()];
	if (messages.length === 0) return;

	for (const userId of new Set(messages.map((m) => m.user).filter((u): u is string => Boolean(u)))) {
		if (!userNames.has(userId)) userNames.set(userId, (await deps.client.getUserInfo(token, userId)).name);
	}

	const groups = groupConversations(channel.name ?? channel.channelId, messages, userNames);
	let newestTs = oldest ?? '0';

	for (const group of groups) {
		if (Number(group.tsEnd) > Number(newestTs)) newestTs = group.tsEnd;

		const conversationKey = slackConversationKey(channel.channelId, group.anchor);
		const sourceRef = slackSourcePath(workspace.teamId, conversationKey);
		const existing = await deps.conversations.findByProjectAndKey(projectId, conversationKey);

		// Cheap pre-check mirroring the engine's authoritative skip — avoids the
		// permalink fetch and row churn for unchanged conversations.
		if (existing && existing.contentHash === group.contentHash && existing.status === 'embedded') continue;

		const permalink = await deps.client.getPermalink(token, channel.channelId, group.threadTs ?? group.tsStart);
		await deps.conversations.upsert({
			id: existing?.id ?? deps.generateId(),
			projectId,
			workspaceId: workspace.id,
			slackChannelId: channel.id,
			channelId: channel.channelId,
			channelName: channel.name,
			conversationKey,
			sourcePath: sourceRef,
			threadTs: group.threadTs,
			tsStart: group.tsStart,
			tsEnd: group.tsEnd,
			permalink,
			participants: group.participants,
			messageCount: group.messageCount,
			reactionCount: group.reactionCount,
			visibility: channel.isPrivate ? 'private' : 'public',
			contentHash: group.contentHash,
		});

		await sink.upsert([{ sourceRef, target: 'documents', content: Buffer.from(group.renderedText, 'utf8'), mimeType: 'text/plain', contentHash: group.contentHash }]);
	}

	// Cursor commit strictly after the embed barrier (see KnowledgeSink.flush).
	if (Number(newestTs) > Number(oldest ?? '0')) {
		await sink.flush();
		await deps.syncState.upsertCursor({ id: deps.generateId(), slackChannelId: channel.id, projectId, lastSyncedTs: newestTs });
	}
}
