import type { IntegrationRepository, KnowledgeConnectorRepository } from '@meshify/data-access';
import type { CredentialVault, PlatformEventBus, ProviderRegistry } from '@meshify/providers';
import { supportsOAuth } from '@meshify/providers';
import { loadIntegrationForOrg } from './integration-support.js';

/**
 * Org-level disconnect: best-effort revocation at the provider, credentials
 * purged from the vault, every dependent project connector flagged, and the
 * integration marked disconnected (the row stays — reconnect restores it,
 * and history/audit keep their referent). Ingested knowledge is NOT deleted;
 * projects delete connectors explicitly when they want teardown.
 */
export class DisconnectIntegrationUseCase {
	constructor(
		private readonly registry: ProviderRegistry,
		private readonly integrations: IntegrationRepository,
		private readonly connectors: KnowledgeConnectorRepository,
		private readonly vault: CredentialVault,
		private readonly events: PlatformEventBus
	) {}

	async execute(command: { orgId: string; integrationId: string }): Promise<void> {
		const integration = await loadIntegrationForOrg(this.integrations, command.integrationId, command.orgId);
		const provider = this.registry.find(integration.provider);

		if (provider && supportsOAuth(provider) && provider.revokeAccess) {
			try {
				await provider.revokeAccess({ integration, vault: this.vault.forIntegration(integration.id) });
			} catch {
				/* revocation is best-effort; the credential purge below is what we guarantee */
			}
		}

		await this.vault.purge(integration.id);

		for (const connector of await this.connectors.listByIntegration(integration.id)) {
			await this.connectors.updateStatus(connector.id, 'disconnected', 'Integration disconnected');
		}

		await this.integrations.updateStatus(integration.id, 'disconnected', null);
		await this.events.publish({
			kind: 'connection.disconnected',
			provider: integration.provider,
			integrationId: integration.id,
			orgId: command.orgId,
		});
	}
}
