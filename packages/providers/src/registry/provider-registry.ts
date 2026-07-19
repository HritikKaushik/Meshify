import type { Provider } from '../base/provider.js';
import type { ProviderDescriptor } from '../base/descriptor.js';
import { ProviderNotFoundError } from '../base/errors.js';

/**
 * The single resolution point for providers. Composition roots register
 * implementations (and descriptor-only "coming soon" entries) at boot; every
 * lookup anywhere in the platform goes through here — adding a provider is
 * `register(createXProvider(deps))` and nothing else.
 */
export class ProviderRegistry {
	private readonly providers = new Map<string, Provider>();

	register(provider: Provider): void {
		const id = provider.descriptor.id;
		if (this.providers.has(id)) throw new Error(`Provider "${id}" is already registered`);
		this.providers.set(id, provider);
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

	descriptors(): ProviderDescriptor[] {
		return this.list().map((p) => p.descriptor);
	}
}

/** A catalog-only entry: visible in the marketplace as "coming soon", implements nothing. */
export function descriptorOnlyProvider(descriptor: ProviderDescriptor): Provider {
	return { descriptor };
}
