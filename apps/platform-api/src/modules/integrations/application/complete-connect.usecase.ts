import type { Integration, IntegrationRepository, IntegrationResourceRepository } from '@meshify/data-access';
import type { CredentialVault, OAuthStateService, PlatformEventBus, ProviderRegistrationService, ProviderRegistry } from '@meshify/providers';
import { ProviderNotConfiguredError, supportsOAuth, supportsResourceBrowsing } from '@meshify/providers';
import { InvalidOAuthStateError, UnsupportedProviderOperationError } from './integration-support.js';

export interface CompleteConnectCommand {
	orgId: string;
	provider: string;
	stateToken: string;
	/** Raw provider callback params (code / installation_id / setup_action / error …). */
	params: Record<string, string | undefined>;
}

export interface CompleteConnectResult {
	integration: Integration;
	/** Where the SPA should land (from the state row — no browser storage involved). */
	returnPath: string | null;
	projectId: string | null;
	intent: 'connect' | 'reconnect';
}

/**
 * Finish an org-level connect. The single-use state row is the org binding: a
 * callback whose state is missing, expired, replayed, or issued for a
 * different org/provider is rejected before any provider verification runs —
 * a guessable installation_id can never be claimed cross-tenant.
 */
export class CompleteConnectUseCase {
	constructor(
		private readonly registry: ProviderRegistry,
		private readonly states: OAuthStateService,
		private readonly integrations: IntegrationRepository,
		private readonly resources: IntegrationResourceRepository,
		private readonly vault: CredentialVault,
		private readonly events: PlatformEventBus,
		private readonly registrations: ProviderRegistrationService
	) {}

	async execute(command: CompleteConnectCommand): Promise<CompleteConnectResult> {
		const provider = this.registry.get(command.provider);
		if (!supportsOAuth(provider)) throw new UnsupportedProviderOperationError(command.provider, 'connect');

		const state = await this.states.consume(command.stateToken);
		if (!state || state.orgId !== command.orgId || state.provider !== command.provider) {
			throw new InvalidOAuthStateError();
		}

		// Resolve the registration the org connects through (managed or BYOA);
		// its app credentials verify the callback and back the integration.
		const registration = await this.registrations.resolve(command.orgId, command.provider);
		if (!registration) throw new ProviderNotConfiguredError(command.provider);

		const result = await provider.completeConnect({ params: command.params }, registration);
		const registrationId = registration.mode === 'byoa' ? registration.registrationId ?? null : null;

		let integration = await this.integrations.findByOrgProviderAccount(command.orgId, command.provider, result.externalAccountId);
		if (integration) {
			await this.integrations.updateAccountInfo(integration.id, {
				externalAccountName: result.externalAccountName,
				metadata: result.metadata,
			});
			await this.integrations.updateStatus(integration.id, 'active', null);
			await this.integrations.updateMode(integration.id, registration.mode);
		} else {
			integration = await this.integrations.create({
				orgId: command.orgId,
				provider: command.provider,
				externalAccountId: result.externalAccountId,
				externalAccountName: result.externalAccountName,
				registrationId,
				mode: registration.mode,
				status: 'active',
				metadata: result.metadata,
			});
		}

		for (const credential of result.credentials) {
			await this.vault.put(integration.id, credential.kind, credential.value, credential.expiresAt ?? null);
		}

		// Refresh the canonical resource inventory so the picker is warm on
		// first paint. Best-effort: a listing hiccup must not fail the connect.
		if (supportsResourceBrowsing(provider)) {
			try {
				const page = await provider.listResources({ integration, vault: this.vault.forIntegration(integration.id), registration });
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
			} catch {
				/* inventory refresh is retried by listing and the maintenance sweep */
			}
		}

		await this.events.publish({
			kind: 'connection.established',
			provider: command.provider,
			integrationId: integration.id,
			orgId: command.orgId,
		});

		const fresh = await this.integrations.findById(integration.id);
		return {
			integration: fresh ?? integration,
			returnPath: state.returnPath,
			projectId: state.projectId,
			intent: state.intent,
		};
	}
}
