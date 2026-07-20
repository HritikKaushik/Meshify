import type { Integration, IntegrationRepository, KnowledgeConnectorRepository } from '@meshify/data-access';

export interface IntegrationSummary {
	integration: Integration;
	/** Project connectors drawing on this integration (repo/workspace attachments). */
	connectorCount: number;
	connectedProjectIds: string[];
}

export class ListIntegrationsUseCase {
	constructor(
		private readonly integrations: IntegrationRepository,
		private readonly connectors: KnowledgeConnectorRepository
	) {}

	async execute(orgId: string): Promise<IntegrationSummary[]> {
		const integrations = await this.integrations.listByOrg(orgId);
		return Promise.all(
			integrations.map(async (integration) => {
				const attached = await this.connectors.listByIntegration(integration.id);
				return {
					integration,
					connectorCount: attached.length,
					connectedProjectIds: [...new Set(attached.map((c) => c.projectId))],
				};
			})
		);
	}
}
