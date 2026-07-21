import type { AuthContext } from '@meshify/data-access';

/**
 * Generic org-admin authorization, shared by every destructive/administrative
 * route (project deletion, connector + integration management). AI-provider
 * management has its own thin wrapper (`requireLlmAdmin`) for a domain-specific
 * message, but both resolve to the same `AuthContext.isOrgAdmin` signal.
 */
export class OrgAdminForbiddenError extends Error {
	constructor(action = 'perform this action') {
		super(`You do not have permission to ${action} for this organization.`);
		this.name = 'OrgAdminForbiddenError';
	}
}

/** Throws {@link OrgAdminForbiddenError} unless the caller is an org admin. */
export function requireOrgAdmin(auth: AuthContext, action?: string): void {
	if (!auth.isOrgAdmin) throw new OrgAdminForbiddenError(action);
}

/**
 * Fine-grained scope check for API keys. A key with an EMPTY scope list is
 * unrestricted (holds every scope — the shared org key and Clerk-provisioned
 * keys); a non-empty list is least-privilege, granting only the listed scopes.
 * Use {@link requireScope} to gate a route on a specific capability (e.g.
 * `documents:write`) so operators can issue narrowly-scoped server keys.
 */
export function hasScope(auth: AuthContext, scope: string): boolean {
	return auth.scopes.length === 0 || auth.scopes.includes(scope);
}

/** Throws {@link OrgAdminForbiddenError} unless the key holds `scope`. */
export function requireScope(auth: AuthContext, scope: string): void {
	if (!hasScope(auth, scope)) throw new OrgAdminForbiddenError(`use the "${scope}" capability`);
}
