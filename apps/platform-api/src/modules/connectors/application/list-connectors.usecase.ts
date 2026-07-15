import type {
	ConnectorStatus,
	ConnectorType,
	DocumentRepository,
	KnowledgeConnector,
	KnowledgeConnectorRepository,
	RepositoryRepository,
	RepositorySyncStatus,
	SlackChannelRepository,
	SlackConversationRepository,
	SlackWorkspaceRepository,
} from '@meshify/data-access';

/**
 * One row in the unified Knowledge Sources list — a connector plus the real,
 * per-type stats overlaid at read time. `status` is derived from the detail
 * (repo sync status, document embedding progress, Slack conversation counts)
 * rather than trusting only the stored column, so the UI always reflects truth.
 */
export interface ConnectorSummary {
	id: string;
	type: ConnectorType;
	displayName: string;
	status: ConnectorStatus;
	/** Ingestable items behind this source: repo=1 tree, documents=N files, slack=N conversations. */
	itemCount: number;
	embeddedCount: number;
	lastActivityAt: string | null;
	/** Type-specific fields for the UI (e.g. remoteUrl, syncStatus, teamName, channel counts). */
	detail: Record<string, unknown>;
	createdAt: string;
}

function statusFromRepoSync(sync: RepositorySyncStatus): ConnectorStatus {
	switch (sync) {
		case 'synced':
			return 'active';
		case 'failed':
			return 'error';
		default:
			return 'connecting';
	}
}

/**
 * Lists every knowledge source a project has connected — GitHub repositories,
 * the uploaded Documents source, and Slack workspaces — as one homogeneous list.
 * This is the generic connector read surface every source shares; the existing
 * `/repositories` and `/documents` endpoints remain for their detail screens.
 */
export class ListConnectorsUseCase {
	constructor(
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly repositories: RepositoryRepository,
		private readonly documents: DocumentRepository,
		private readonly slackWorkspaces: SlackWorkspaceRepository,
		private readonly slackChannels: SlackChannelRepository,
		private readonly slackConversations: SlackConversationRepository
	) {}

	async execute(projectId: string): Promise<ConnectorSummary[]> {
		const connectors = await this.connectors.listByProject(projectId);
		return Promise.all(connectors.map((connector) => this.summarize(connector, projectId)));
	}

	private async summarize(connector: KnowledgeConnector, projectId: string): Promise<ConnectorSummary> {
		const base = {
			id: connector.id,
			type: connector.type,
			displayName: connector.displayName,
			createdAt: connector.createdAt.toISOString(),
		};

		if (connector.type === 'github') {
			const repo = await this.repositories.findByConnectorId(connector.id);
			return {
				...base,
				status: repo ? statusFromRepoSync(repo.syncStatus) : connector.status,
				itemCount: repo ? 1 : 0,
				embeddedCount: repo?.syncStatus === 'synced' ? 1 : 0,
				lastActivityAt: repo ? repo.updatedAt.toISOString() : null,
				detail: {
					source: repo?.source ?? connector.config.source ?? 'github',
					remoteUrl: repo?.remoteUrl ?? null,
					defaultBranch: repo?.defaultBranch ?? null,
					syncStatus: repo?.syncStatus ?? null,
					lastSyncedCommit: repo?.lastSyncedCommit ?? null,
				},
			};
		}

		if (connector.type === 'documents') {
			const stats = await this.documents.statsByProject(projectId);
			const status: ConnectorStatus = stats.embedded > 0 ? 'active' : stats.total > 0 ? 'connecting' : connector.status;
			return {
				...base,
				status,
				itemCount: stats.total,
				embeddedCount: stats.embedded,
				lastActivityAt: stats.lastUpdatedAt ? stats.lastUpdatedAt.toISOString() : null,
				detail: {},
			};
		}

		// slack
		const workspace = await this.slackWorkspaces.findByConnectorId(connector.id);
		if (!workspace) {
			return { ...base, status: connector.status, itemCount: 0, embeddedCount: 0, lastActivityAt: null, detail: {} };
		}
		const [channels, convoStats] = await Promise.all([this.slackChannels.listByWorkspace(workspace.id), this.slackConversations.statsByWorkspace(workspace.id)]);
		const selectedChannels = channels.filter((c) => c.selected).length;
		return {
			...base,
			status: connector.status,
			itemCount: convoStats.total,
			embeddedCount: convoStats.embedded,
			lastActivityAt: convoStats.lastUpdatedAt ? convoStats.lastUpdatedAt.toISOString() : null,
			detail: {
				teamName: workspace.teamName,
				teamId: workspace.teamId,
				channelCount: channels.length,
				selectedChannelCount: selectedChannels,
			},
		};
	}
}
