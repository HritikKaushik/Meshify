import { describe, it, expect } from 'vitest';
import { LlmProviderRegistry } from './llm-provider-registry.js';
import { LlmProviderNotFoundError } from '../interfaces/errors.js';
import { createOpenAiProvider } from '../../providers/openai/openai.provider.js';
import { createAnthropicProvider } from '../../providers/anthropic/anthropic.provider.js';

describe('LlmProviderRegistry', () => {
	it('registers and resolves a provider by id', () => {
		const registry = new LlmProviderRegistry();
		const openai = createOpenAiProvider();
		registry.register(openai);
		expect(registry.get('openai')).toBe(openai);
		expect(registry.has('openai')).toBe(true);
		expect(registry.find('openai')).toBe(openai);
	});

	it('throws LlmProviderNotFoundError for an unknown id', () => {
		const registry = new LlmProviderRegistry();
		expect(() => registry.get('nope')).toThrow(LlmProviderNotFoundError);
		expect(registry.find('nope')).toBeUndefined();
	});

	it('rejects duplicate registration', () => {
		const registry = new LlmProviderRegistry();
		registry.register(createOpenAiProvider());
		expect(() => registry.register(createOpenAiProvider())).toThrow(/already registered/);
	});

	it('preserves registration order in list()/manifests()', () => {
		const registry = new LlmProviderRegistry();
		registry.register(createOpenAiProvider());
		registry.register(createAnthropicProvider());
		expect(registry.manifests().map((m) => m.id)).toEqual(['openai', 'anthropic']);
	});
});
