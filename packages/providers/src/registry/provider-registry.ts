import type { Provider } from '../base/provider.js';
import type { ProviderManifest } from '../base/manifest.js';
import { validateManifest } from '../base/manifest.js';
import { ProviderNotFoundError } from '../base/errors.js';

/**
 * The single resolution point for providers. Composition roots register
 * implementations (and manifest-only "coming soon" entries) at boot; every
 * lookup anywhere in the platform goes through here — adding a provider is
 * `register(createXProvider(deps))` and nothing else.
 *
 * Registration validates the manifest (id shape, supported manifestVersion,
 * semver providerVersion, flag/field coherence) so a malformed or
 * incompatible provider fails at boot, not at first use.
 */
export class ProviderRegistry {
	private readonly providers = new Map<string, Provider>();

	register(provider: Provider): void {
		const manifest = provider.manifest;
		const problems = validateManifest(manifest);
		if (problems.length > 0) {
			throw new Error(`Provider "${manifest.id}" has an invalid manifest: ${problems.join('; ')}`);
		}
		if (this.providers.has(manifest.id)) throw new Error(`Provider "${manifest.id}" is already registered`);
		this.providers.set(manifest.id, provider);
	}

	find(id: string): Provider | undefined {
		return this.providers.get(id);
	}

	get(id: string): Provider {
		const provider = this.providers.get(id);
		if (!provider) throw new ProviderNotFoundError(id);
		return provider;
	}

	has(id: string): boolean {
		return this.providers.has(id);
	}

	/** Registration order — the marketplace catalog order. */
	list(): Provider[] {
		return [...this.providers.values()];
	}

	manifests(): ProviderManifest[] {
		return this.list().map((p) => p.manifest);
	}
}

/** A catalog-only entry: visible in the marketplace as "coming soon", implements nothing. */
export function manifestOnlyProvider(manifest: ProviderManifest): Provider {
	return { manifest };
}
