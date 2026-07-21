import type { AuthContext } from '@meshify/data-access';

/**
 * The single authorization hook for managing AI providers. Centralized so every
 * mutating LLM route calls `requireLlmAdmin` — no scattered role checks.
 *
 * Org-admin is decided by `AuthContext.isOrgAdmin`, which the auth guard derives
 * from the BFF-forwarded Clerk org role (org:admin → true, org:member → false).
 * A direct API-key caller (a server credential that never passes through the
 * BFF) carries no role header and is treated as full-access.
 */
export function canManageLLMProviders(auth: AuthContext): boolean {
	return auth.isOrgAdmin;
}

export class LlmProviderForbiddenError extends Error {
	constructor() {
		super('You do not have permission to manage AI providers for this organization.');
		this.name = 'LlmProviderForbiddenError';
	}
}

/** Guards a mutating LLM-provider operation. No-op today; the RBAC seam. */
export function requireLlmAdmin(auth: AuthContext): void {
	if (!canManageLLMProviders(auth)) throw new LlmProviderForbiddenError();
}
