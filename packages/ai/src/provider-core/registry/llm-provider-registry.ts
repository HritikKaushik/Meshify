import type { LlmProvider } from '../interfaces/llm-provider.js';
import type { LlmProviderManifest } from '../interfaces/llm-manifest.js';
import { validateLlmManifest } from '../interfaces/llm-manifest.js';
import { LlmProviderNotFoundError } from '../interfaces/errors.js';

/**
 * The single resolution point for AI providers — the LLM counterpart of
 * `@meshify/providers`' `ProviderRegistry`, kept entirely separate so the two
 * subsystems evolve independently. Validates each manifest at registration so a
 * malformed provider fails fast at boot rather than at request time.
 */
export class LlmProviderRegistry {
	private readonly providers = new Map<string, LlmProvider>();

	register(provider: LlmProvider): void {
		const manifest = provider.manifest;
		const problems = validateLlmManifest(manifest);
		if (problems.length > 0) {
			throw new Error(`LLM provider "${manifest.id}" has an invalid manifest: ${problems.join('; ')}`);
		}
		if (this.providers.has(manifest.id)) {
			throw new Error(`LLM provider "${manifest.id}" is already registered`);
		}
		this.providers.set(manifest.id, provider);
	}

	find(id: string): LlmProvider | undefined {
		return this.providers.get(id);
	}

	get(id: string): LlmProvider {
		const provider = this.providers.get(id);
		if (!provider) throw new LlmProviderNotFoundError(id);
		return provider;
	}

	has(id: string): boolean {
		return this.providers.has(id);
	}

	/** Registration order — the marketplace catalog order. */
	list(): LlmProvider[] {
		return [...this.providers.values()];
	}

	manifests(): LlmProviderManifest[] {
		return this.list().map((provider) => provider.manifest);
	}
}
