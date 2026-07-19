import { describe, expect, it } from 'vitest';
import { ProviderRegistry, descriptorOnlyProvider } from './provider-registry.js';
import { ProviderNotFoundError } from '../base/errors.js';
import { NO_CAPABILITIES } from '../base/descriptor.js';
import { supportsOAuth } from '../base/provider.js';

const descriptor = (id: string) =>
	({ id, displayName: id, category: 'code', availability: 'coming_soon', capabilities: NO_CAPABILITIES, iconKey: id, summary: `${id} summary` }) as const;

describe('ProviderRegistry', () => {
	it('resolves registered providers and lists them in registration order', () => {
		const registry = new ProviderRegistry();
		registry.register(descriptorOnlyProvider(descriptor('github')));
		registry.register(descriptorOnlyProvider(descriptor('slack')));
		expect(registry.get('github').descriptor.id).toBe('github');
		expect(registry.list().map((p) => p.descriptor.id)).toEqual(['github', 'slack']);
		expect(registry.descriptors().map((d) => d.id)).toEqual(['github', 'slack']);
	});

	it('throws ProviderNotFoundError for unknown ids and rejects duplicate registration', () => {
		const registry = new ProviderRegistry();
		registry.register(descriptorOnlyProvider(descriptor('github')));
		expect(() => registry.get('gitlab')).toThrow(ProviderNotFoundError);
		expect(registry.find('gitlab')).toBeUndefined();
		expect(() => registry.register(descriptorOnlyProvider(descriptor('github')))).toThrow(/already registered/);
	});

	it('descriptor-only entries implement no capabilities', () => {
		const comingSoon = descriptorOnlyProvider(descriptor('sharepoint'));
		expect(supportsOAuth(comingSoon)).toBe(false);
	});
});
