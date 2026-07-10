import { describe, expect, it } from 'vitest';
import { createEmbeddingProvider } from './factory.js';
import { MissingEmbeddingKeyError, UnsupportedEmbeddingProfileError } from './embedding-provider.js';
import { isOpenAiEmbeddingProfile } from './openai-embedding-provider.js';

describe('isOpenAiEmbeddingProfile', () => {
	it('recognizes OpenAI embedding profiles only', () => {
		expect(isOpenAiEmbeddingProfile('text-embedding-3-large')).toBe(true);
		expect(isOpenAiEmbeddingProfile('text-embedding-3-small')).toBe(true);
		expect(isOpenAiEmbeddingProfile('miniLM')).toBe(false);
	});
});

describe('createEmbeddingProvider', () => {
	it('builds an OpenAI provider bound to the project profile', () => {
		const provider = createEmbeddingProvider('text-embedding-3-large', { openAiKey: 'sk-test' });
		expect(provider.profile).toBe('text-embedding-3-large');
	});

	it('throws MissingEmbeddingKeyError when an OpenAI profile has no key', () => {
		expect(() => createEmbeddingProvider('text-embedding-3-large', {})).toThrow(MissingEmbeddingKeyError);
	});

	it('throws UnsupportedEmbeddingProfileError for non-OpenAI profiles', () => {
		expect(() => createEmbeddingProvider('miniLM', { openAiKey: 'sk-test' })).toThrow(UnsupportedEmbeddingProfileError);
	});
});
