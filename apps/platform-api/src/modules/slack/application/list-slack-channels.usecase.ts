import type { KnowledgeConnectorRepository, SlackChannel, SlackChannelRepository, SlackWorkspaceRepository } from '@meshify/data-access';
import { loadSlackWorkspace } from './slack-support.js';

/** Lists a Slack connector's discovered channels for the channel picker. */
export class ListSlackChannelsUseCase {
	constructor(
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly workspaces: SlackWorkspaceRepository,
		private readonly channels: SlackChannelRepository
	) {}

	async execute(command: { projectId: string; connectorId: string }): Promise<SlackChannel[]> {
		const { workspace } = await loadSlackWorkspace(this.connectors, this.workspaces, command.projectId, command.connectorId);
		return this.channels.listByWorkspace(workspace.id);
	}
}
