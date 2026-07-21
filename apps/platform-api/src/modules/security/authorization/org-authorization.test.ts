import { describe, expect, it } from 'vitest';
import type { AuthContext } from '@meshify/data-access';
import { OrgAdminForbiddenError, requireOrgAdmin, hasScope, requireScope } from './org-authorization.js';

function auth(isOrgAdmin: boolean, scopes: string[] = []): AuthContext {
	return { orgId: 'org-1', keyId: 'key-1', scopes, isOrgAdmin };
}

describe('requireOrgAdmin', () => {
	it('allows an org admin', () => {
		expect(() => requireOrgAdmin(auth(true))).not.toThrow();
	});

	it('rejects a non-admin member with OrgAdminForbiddenError', () => {
		expect(() => requireOrgAdmin(auth(false))).toThrow(OrgAdminForbiddenError);
	});

	it('includes the action in the message', () => {
		expect(() => requireOrgAdmin(auth(false), 'delete projects')).toThrow(/delete projects/);
	});
});

describe('scopes', () => {
	it('empty scopes grant every capability (unrestricted key)', () => {
		expect(hasScope(auth(true, []), 'documents:write')).toBe(true);
		expect(() => requireScope(auth(true, []), 'documents:write')).not.toThrow();
	});

	it('a scoped key only holds its listed scopes', () => {
		expect(hasScope(auth(false, ['read']), 'read')).toBe(true);
		expect(hasScope(auth(false, ['read']), 'documents:write')).toBe(false);
		expect(() => requireScope(auth(false, ['read']), 'documents:write')).toThrow(OrgAdminForbiddenError);
	});
});
