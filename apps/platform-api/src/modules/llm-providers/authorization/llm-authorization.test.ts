import { describe, expect, it } from 'vitest';
import type { AuthContext } from '@meshify/data-access';
import { canManageLLMProviders, requireLlmAdmin, LlmProviderForbiddenError } from './llm-authorization.js';

function auth(isOrgAdmin: boolean): AuthContext {
	return { orgId: 'org-1', keyId: 'key-1', scopes: [], isOrgAdmin };
}

describe('llm-authorization', () => {
	it('lets an org admin manage providers', () => {
		expect(canManageLLMProviders(auth(true))).toBe(true);
		expect(() => requireLlmAdmin(auth(true))).not.toThrow();
	});

	it('forbids a non-admin member from managing providers', () => {
		expect(canManageLLMProviders(auth(false))).toBe(false);
		expect(() => requireLlmAdmin(auth(false))).toThrow(LlmProviderForbiddenError);
	});
});
