import type { AuthContext } from '@meshify/data-access';

/**
 * A request's `req.auth` for tests. Defaults to what a direct, unscoped API-key
 * caller resolves to (the most permissive principal), so a test names only the
 * fields it is actually about: `buildAuthContext({ isOrgAdmin: false })`.
 */
export function buildAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
	return { orgId: 'org-1', keyId: 'key-1', scopes: [], isOrgAdmin: true, ...overrides };
}
