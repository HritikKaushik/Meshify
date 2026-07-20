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
		// One query for the org's configurable providers, then resolve in memory —
		// no per-provider DB round-trip on this per-page-load endpoint.
		const configured = await this.registrations.configuredProviders(orgId);
		return this.registry.list().map((provider) => ({
			manifest: provider.manifest,
			configured: provider.manifest.availability === 'available' && configured.has(provider.manifest.id),
		}));
	}
}
