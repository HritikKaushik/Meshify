import { describe, expect, it } from 'vitest';
import type { AuthContext } from '@meshify/data-access';
import { OrgAdminForbiddenError, requireOrgAdmin } from './org-authorization.js';

function auth(isOrgAdmin: boolean): AuthContext {
	return { orgId: 'org-1', keyId: 'key-1', scopes: [], isOrgAdmin };
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
