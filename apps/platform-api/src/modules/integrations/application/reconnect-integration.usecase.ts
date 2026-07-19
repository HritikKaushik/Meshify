import type { IntegrationRepository } from '@meshify/data-access';
import type { OAuthStateService, ProviderRegistry } from '@meshify/providers';
import { supportsOAuth } from '@meshify/providers';
import { UnsupportedProviderOperationError, loadIntegrationForOrg } from './integration-support.js';

/** Re-run the consent flow for an existing integration (expired/revoked grants, scope upgrades). */
export class ReconnectIntegrationUseCase {
	constructor(
		private readonly registry: ProviderRegistry,
		private readonly states: OAuthStateService,
		private readonly integrations: IntegrationRepository
	) {}

	async execute(command: { orgId: string; integrationId: string; returnPath?: string; createdByKeyId?: string }): Promise<{ url: string }> {
		const integration = await loadIntegrationForOrg(this.integrations, command.integrationId, command.orgId);
		const provider = this.registry.get(integration.provider);
		if (!supportsOAuth(provider)) throw new UnsupportedProviderOperationError(integration.provider, 'reconnect');

		const { token } = await this.states.issue({
			orgId: command.orgId,
			provider: integration.provider,
			intent: 'reconnect',
			integrationId: integration.id,
			returnPath: command.returnPath ?? null,
			createdByKeyId: command.createdByKeyId ?? null,
		});

		return {
			url: provider.buildConnectUrl({ stateToken: token, intent: 'reconnect', externalAccountId: integration.externalAccountId }),
		};
	}
}
