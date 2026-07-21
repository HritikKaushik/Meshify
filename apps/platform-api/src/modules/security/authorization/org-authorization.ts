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
