import { describe, expect, it } from 'vitest';
import { ProviderRegistry, manifestOnlyProvider } from './provider-registry.js';
import { ProviderNotFoundError } from '../base/errors.js';
import { CURRENT_MANIFEST_VERSION, NO_CAPABILITIES } from '../base/manifest.js';
import type { ProviderManifest } from '../base/manifest.js';
import { supportsOAuth } from '../base/provider.js';

const manifest = (id: string, overrides: Partial<ProviderManifest> = {}): ProviderManifest => ({
	id,
	manifestVersion: CURRENT_MANIFEST_VERSION,
	providerVersion: '1.0.0',
	displayName: id,
	category: 'code',
	availability: 'coming_soon',
	capabilities: NO_CAPABILITIES,
	auth: { type: 'none' },
	iconKey: id,
	summary: `${id} summary`,
	...overrides,
});

describe('ProviderRegistry', () => {
	it('resolves registered providers and lists them in registration order', () => {
		const registry = new ProviderRegistry();
		registry.register(manifestOnlyProvider(manifest('github')));
		registry.register(manifestOnlyProvider(manifest('slack')));
		expect(registry.get('github').manifest.id).toBe('github');
		expect(registry.list().map((p) => p.manifest.id)).toEqual(['github', 'slack']);
		expect(registry.manifests().map((m) => m.id)).toEqual(['github', 'slack']);
	});

	it('throws ProviderNotFoundError for unknown ids and rejects duplicate registration', () => {
		const registry = new ProviderRegistry();
		registry.register(manifestOnlyProvider(manifest('github')));
		expect(() => registry.get('gitlab')).toThrow(ProviderNotFoundError);
		expect(registry.find('gitlab')).toBeUndefined();
		expect(() => registry.register(manifestOnlyProvider(manifest('github')))).toThrow(/already registered/);
	});

	it('rejects invalid or incompatible manifests at registration', () => {
		const registry = new ProviderRegistry();
		expect(() => registry.register(manifestOnlyProvider(manifest('Bad_Id')))).toThrow(/kebab-case/);
		expect(() => registry.register(manifestOnlyProvider(manifest('future', { manifestVersion: 99 })))).toThrow(/not supported/);
		expect(() => registry.register(manifestOnlyProvider(manifest('unversioned', { providerVersion: 'v1' })))).toThrow(/semver/);
		expect(() =>
			registry.register(manifestOnlyProvider(manifest('toolless', { capabilities: { ...NO_CAPABILITIES, tools: true } })))
		).toThrow(/toolNames/);
	});

	it('manifest-only entries implement no capabilities', () => {
		const comingSoon = manifestOnlyProvider(manifest('sharepoint'));
		expect(supportsOAuth(comingSoon)).toBe(false);
	});
});
