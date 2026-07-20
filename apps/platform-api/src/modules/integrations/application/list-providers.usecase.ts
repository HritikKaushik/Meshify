import type { ProviderManifest, ProviderRegistrationService, ProviderRegistry } from '@meshify/providers';

export interface ProviderCatalogEntry {
	manifest: ProviderManifest;
	/** Whether THIS org can operate the provider (managed env configured, or the org has a BYOA registration). */
	configured: boolean;
}

/** The marketplace catalog: every registered provider's manifest with the org's configured state. */
export class ListProvidersUseCase {
	constructor(
		private readonly registry: ProviderRegistry,
		private readonly registrations: ProviderRegistrationService
	) {}

	async execute(orgId: string): Promise<ProviderCatalogEntry[]> {
		return Promise.all(
			this.registry.list().map(async (provider) => ({
				manifest: provider.manifest,
				configured: provider.manifest.availability === 'available' && (await this.registrations.isConfigured(orgId, provider.manifest.id)),
			}))
		);
	}
}
