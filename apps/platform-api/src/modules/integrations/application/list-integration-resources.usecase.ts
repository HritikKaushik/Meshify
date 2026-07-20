import type { IntegrationRepository, IntegrationResourceRepository, KnowledgeConnectorRepository } from '@meshify/data-access';
import type { CredentialVault, ProviderRegistrationService, ProviderRegistry } from '@meshify/providers';
import { supportsResourceBrowsing } from '@meshify/providers';
import { UnsupportedProviderOperationError, loadIntegrationForOrg } from './integration-support.js';

export interface BrowsableResource {
	id: string;
	name: string;
	kind: string;
	private: boolean;
	/** Already attached by at least one project connector of this org. */
	connected: boolean;
	extra?: Record<string, unknown>;
}

/**
 * The picker's data source: live-list the grant's resources from the provider,
 * refresh the canonical inventory cache, and flag which resources are already
 * attached (connectors record their canonical resource ids in
 * `config.resourceIds` — a provider-agnostic convention).
 */
export class ListIntegrationResourcesUseCase {
	constructor(
		private readonly registry: ProviderRegistry,
		private readonly integrations: IntegrationRepository,
		private readonly resources: IntegrationResourceRepository,
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly vault: CredentialVault,
		private readonly registrations: ProviderRegistrationService
	) {}

	async execute(command: { orgId: string; integrationId: string; cursor?: string }): Promise<{ resources: BrowsableResource[]; nextCursor?: string }> {
		const integration = await loadIntegrationForOrg(this.integrations, command.integrationId, command.orgId);
		const provider = this.registry.get(integration.provider);
		if (!supportsResourceBrowsing(provider)) throw new UnsupportedProviderOperationError(integration.provider, 'resource listing');
		const registration = await this.registrations.resolveForIntegration(integration);
		if (!registration) throw new UnsupportedProviderOperationError(integration.provider, 'resource listing (no registration)');

		const page = await provider.listResources({ integration, vault: this.vault.forIntegration(integration.id), registration }, command.cursor);

		await this.resources.upsertMany(
			page.resources.map((r) => ({
				integrationId: integration.id,
				resourceId: r.id,
				kind: r.kind,
				name: r.name,
				private: r.private,
				metadata: r.extra,
			}))
		);

		const attached = await this.connectors.listByIntegration(integration.id);
		const connectedIds = new Set(attached.flatMap((c) => (Array.isArray(c.config.resourceIds) ? (c.config.resourceIds as string[]) : [])));

		return {
			resources: page.resources.map((r) => ({
				id: r.id,
				name: r.name,
				kind: r.kind,
				private: r.private ?? false,
				connected: connectedIds.has(r.id),
				extra: r.extra,
			})),
			nextCursor: page.nextCursor,
		};
	}
}
