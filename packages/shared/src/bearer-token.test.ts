import { describe, expect, it } from 'vitest';
import { bearerTokenMatches } from './bearer-token.js';

describe('bearerTokenMatches', () => {
	it('accepts the exact token, case-insensitive scheme, tolerant of surrounding whitespace', () => {
		expect(bearerTokenMatches('Bearer s3cret-token-value', 's3cret-token-value')).toBe(true);
		expect(bearerTokenMatches('bearer   s3cret-token-value ', 's3cret-token-value')).toBe(true);
	});

	it('rejects a wrong, partial, or differently-sized token, and a missing or malformed header', () => {
		expect(bearerTokenMatches('Bearer s3cret-token-valu', 's3cret-token-value')).toBe(false);
		expect(bearerTokenMatches('Bearer s3cret-token-value-and-more', 's3cret-token-value')).toBe(false);
		expect(bearerTokenMatches('Bearer x', 's3cret-token-value')).toBe(false);
		expect(bearerTokenMatches('Basic s3cret-token-value', 's3cret-token-value')).toBe(false);
		expect(bearerTokenMatches(undefined, 's3cret-token-value')).toBe(false);
		expect(bearerTokenMatches('Bearer ', 's3cret-token-value')).toBe(false);
	});

	it('never matches when no token is configured', () => {
		expect(bearerTokenMatches('Bearer ', '')).toBe(false);
	});
});
