import { randomUUID } from 'node:crypto';
import { decryptSecret, slackConversationKey, slackSourcePath } from '@meshify/data-access';
import type {
	KnowledgeConnectorRepository,
	PipelineJobRepository,
	Project,
	ProjectRepository,
	SlackChannel,
	SlackChannelRepository,
	SlackConversationRepository,
	SlackSyncStateRepository,
	SlackWorkspace,
	SlackWorkspaceRepository,
} from '@meshify/data-access';
import type { SlackClient } from '@meshify/slack';
import type { JobEventPublisher } from '@meshify/queues';
import type { RagPort } from '@meshify/rocketride-gateway';
import { resolveIngestToken, type IngestTokenDeps } from '../processors/resolve-ingest-token.js';
import type { JobProgress } from '../processors/job-progress.js';
import { groupConversations } from './conversation-grouper.js';

/** Narrow port over the vector store — purges a conversation's stale points before a re-ingest. */
export interface SlackVectorStore {
	deleteBySourcePaths(collection: string, paths: string[]): Promise<void>;
}

export interface SlackIngestionDeps extends IngestTokenDeps {
	connectors: KnowledgeConnectorRepository;
	pipelineJobs: PipelineJobRepository;
	slackWorkspaces: SlackWorkspaceRepository;
	slackChannels: SlackChannelRepository;
	slackConversations: SlackConversationRepository;
	slackSyncState: SlackSyncStateRepository;
	projects: ProjectRepository;
	slack: SlackClient;
	rag: RagPort;
	vectors: SlackVectorStore;
	jobEvents: JobEventPublisher;
	documentChunkSize: number;
	/** ORG_KEY_ENCRYPTION_KEY — required to decrypt the workspace access token. */
	encryptionKey?: string;
}

export interface SlackIngestionCommand {
	connectorId: string;
	workspaceId: string;
	projectId: string;
}

/**
 * The shared Slack ingestion path used by both the ingest (full pull) and sync
 * (incremental) processors. Pulls each selected channel's history, groups it
 * into conversation documents, and streams them through the project's existing
 * docs-ingest pipeline into the `_documents` Qdrant collection under
 * `slack/...` source paths — with all metadata preserved in Postgres for
 * citations. Unchanged conversations (by content hash) are skipped; changed
 * ones have their stale vectors purged before re-ingesting.
 */
export async function ingestWorkspace(deps: SlackIngestionDeps, command: SlackIngestionCommand, options: { incremental: boolean }, progress?: JobProgress): Promise<void> {
	await progress?.stage('Connecting workspace', 5);
	const [workspace, project] = await Promise.all([deps.slackWorkspaces.findById(command.workspaceId), deps.projects.findById(command.projectId)]);
	if (!workspace) throw new Error(`Slack workspace "${command.workspaceId}" not found`);
	if (!project) throw new Error(`Project "${command.projectId}" not found`);
	if (!deps.encryptionKey) throw new Error('ORG_KEY_ENCRYPTION_KEY is not set — cannot decrypt the Slack access token');

	progress?.setTitle(workspace.teamName ?? 'Slack workspace');
	// Legacy per-workspace token; the provider-platform sync engine sources the
	// token from the integration's CredentialVault instead (M4 cutover).
	if (!workspace.encryptedAccessToken) {
		throw new Error(`Slack workspace "${workspace.id}" has no legacy access token — it must sync through its integration`);
	}
	const token = decryptSecret(deps.encryptionKey, workspace.encryptedAccessToken);
	await progress?.stage('Loading channels', 10);
	const channels = await deps.slackChannels.listSelectedByWorkspace(command.workspaceId);
	if (channels.length === 0) {
		await deps.connectors.updateStatus(command.connectorId, 'active', null);
		return;
	}

	const ingestToken = await resolveIngestToken(project, 'documents', deps.documentChunkSize, deps);
	const userNames = new Map<string, string>();

	// Isolate per-channel failures: a channel the bot isn't a member of returns
	// `not_in_channel`, which must skip that channel — not kill the whole job and
	// take every accessible channel down with it. Only fail the job if EVERY
	// selected channel failed (so it's retried and surfaced).
	const skipped: string[] = [];
	for (let i = 0; i < channels.length; i++) {
		const channel = channels[i]!;
		await progress?.stage(`Processing #${channel.name ?? channel.channelId} (${i + 1}/${channels.length})`, 15 + Math.round((i / channels.length) * 80));
		try {
			await ingestChannel(deps, { workspace, project, channel, token, ingestToken, userNames, incremental: options.incremental });
		} catch (err) {
			skipped.push(`#${channel.name ?? channel.channelId}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	if (skipped.length === channels.length) {
		throw new Error(`Slack ingestion failed for all ${channels.length} selected channel(s) — is the bot a member? ${skipped.join('; ')}`);
	}
	// Partial success stays 'active' (the connector is usable); the skipped channels are recorded as a warning.
	await deps.connectors.updateStatus(command.connectorId, 'active', skipped.length > 0 ? `Skipped ${skipped.length} channel(s): ${skipped.join('; ')}` : null);
}

async function ingestChannel(
	deps: SlackIngestionDeps,
	ctx: { workspace: SlackWorkspace; project: Project; channel: SlackChannel; token: string; ingestToken: string; userNames: Map<string, string>; incremental: boolean }
): Promise<void> {
	const { workspace, project, channel, token, ingestToken, userNames } = ctx;

	let oldest: string | undefined;
	if (ctx.incremental) {
		const syncState = await deps.slackSyncState.findByChannel(channel.id);
		oldest = syncState?.lastSyncedTs ?? undefined;
	}

	const history = await deps.slack.fetchHistory(token, channel.channelId, { oldest });

	// conversations.history returns thread parents but not their replies — pull replies for each parent.
	const collected = new Map<string, (typeof history)[number]>();
	for (const message of history) {
		collected.set(message.ts, message);
		if (message.threadTs && Number(message.threadTs) === Number(message.ts)) {
			const replies = await deps.slack.fetchReplies(token, channel.channelId, message.threadTs);
			for (const reply of replies) collected.set(reply.ts, reply);
		}
	}

	// Incremental sync: a reply added to an OLD thread never reappears in history
	// (a parent's ts is immutable and now below the cursor), so re-fetch replies
	// for every already-stored thread and let the content-hash skip suppress
	// unchanged ones. Without this, existing threads would freeze after first ingest.
	if (ctx.incremental) {
		const storedThreads = (await deps.slackConversations.listByChannel(channel.id)).filter((c) => c.threadTs && c.status !== 'deleted');
		for (const conv of storedThreads) {
			if (collected.has(conv.threadTs!)) continue; // already refreshed via history above
			const replies = await deps.slack.fetchReplies(token, channel.channelId, conv.threadTs!);
			for (const reply of replies) collected.set(reply.ts, reply);
		}
	}

	const messages = [...collected.values()];
	if (messages.length === 0) return;

	// Resolve display names once per user (cached across channels).
	for (const userId of new Set(messages.map((m) => m.user).filter((u): u is string => Boolean(u)))) {
		if (!userNames.has(userId)) {
			const info = await deps.slack.getUserInfo(token, userId);
			userNames.set(userId, info.name);
		}
	}

	const groups = groupConversations(channel.name ?? channel.channelId, messages, userNames);
	let newestTs = oldest ?? '0';

	for (const group of groups) {
		if (Number(group.tsEnd) > Number(newestTs)) newestTs = group.tsEnd;

		const conversationKey = slackConversationKey(channel.channelId, group.anchor);
		const sourcePath = slackSourcePath(workspace.teamId, conversationKey);
		const existing = await deps.slackConversations.findByProjectAndKey(project.id, conversationKey);

		// Skip conversations whose rendered content is unchanged since last embed.
		if (existing && existing.contentHash === group.contentHash && existing.status === 'embedded') continue;

		const permalink = await deps.slack.getPermalink(token, channel.channelId, group.threadTs ?? group.tsStart);

		const conversation = await deps.slackConversations.upsert({
			id: existing?.id ?? randomUUID(),
			projectId: project.id,
			workspaceId: workspace.id,
			slackChannelId: channel.id,
			channelId: channel.channelId,
			channelName: channel.name,
			conversationKey,
			sourcePath,
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

		// Purge stale points before re-ingesting a changed conversation (repo-sync can't do this; Slack has a stable per-conversation path).
		if (existing) await deps.vectors.deleteBySourcePaths(project.qdrantCollectionDocs, [sourcePath]);

		const result = await deps.rag.ingestFiles(ingestToken, [{ path: sourcePath, buffer: Buffer.from(group.renderedText, 'utf8'), mimeType: 'text/plain' }]);
		if (!result.completed) throw new Error(`Slack ingestion failed for ${sourcePath}: ${result.errors.join('; ')}`);

		await deps.slackConversations.updateStatus(conversation.id, 'embedded');
	}

	// Advance the incremental cursor to the newest message ts seen this run.
	if (Number(newestTs) > Number(oldest ?? '0')) {
		await deps.slackSyncState.upsertCursor({ id: randomUUID(), slackChannelId: channel.id, projectId: project.id, lastSyncedTs: newestTs });
	}
}
