import type { AuthContext } from '@meshify/data-access';

/**
 * The single authorization hook for managing AI providers. Centralized so that
 * when RBAC lands, ONLY this function changes — every mutating LLM route calls
 * `requireLlmAdmin`, no scattered role checks.
 *
 * TODO(RBAC): platform-api currently has no role concept. Every authenticated
 * request carries an org-scoped API key (the BFF resolves a Clerk session to one
 * org key = full org access), and `AuthContext.scopes` is not yet populated with
 * granular scopes. So today this returns `true`, preserving existing behavior:
 * any authenticated org member may manage providers. When roles arrive, implement
 * this as e.g. `return auth.scopes.includes('llm:admin')` or a Clerk org-role
 * check threaded through the BFF — nothing else needs to change.
 */
export function canManageLLMProviders(_auth: AuthContext): boolean {
	return true;
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
