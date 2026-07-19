import type { ProviderManifest, ProviderRegistry } from '@meshify/providers';

export interface ProviderCatalogEntry {
	manifest: ProviderManifest;
	/** Whether this deployment can operate the provider (managed app configured). */
	configured: boolean;
}

/** The marketplace catalog: every registered provider's manifest, in registration order. */
export class ListProvidersUseCase {
	constructor(private readonly registry: ProviderRegistry) {}

	execute(): ProviderCatalogEntry[] {
		return this.registry.list().map((provider) => ({
			manifest: provider.manifest,
			configured: provider.manifest.availability === 'available' && (provider.isConfigured?.() ?? true),
		}));
	}
}
