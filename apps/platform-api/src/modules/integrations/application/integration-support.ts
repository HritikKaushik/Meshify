import type { Integration, IntegrationRepository } from '@meshify/data-access';

/** Unknown id, cross-org probe, and deleted row are deliberately indistinguishable (404). */
export class IntegrationNotFoundError extends Error {
	constructor(id: string) {
		super(`Integration "${id}" not found`);
		this.name = 'IntegrationNotFoundError';
	}
}

/** The consumed state token was missing, expired, replayed, or bound to a different org/provider. */
export class InvalidOAuthStateError extends Error {
	constructor() {
		super('This connection attempt is invalid or has expired — start again from Meshify');
		this.name = 'InvalidOAuthStateError';
	}
}

/** The provider exists but does not support the requested operation (e.g. no resource picker). */
export class UnsupportedProviderOperationError extends Error {
	constructor(providerId: string, operation: string) {
		super(`Provider "${providerId}" does not support ${operation}`);
		this.name = 'UnsupportedProviderOperationError';
	}
}

/** Org-scoped loader: cross-org probing looks identical to a missing integration. */
export async function loadIntegrationForOrg(integrations: IntegrationRepository, id: string, orgId: string): Promise<Integration> {
	const integration = await integrations.findByIdForOrg(id, orgId);
	if (!integration) throw new IntegrationNotFoundError(id);
	return integration;
}
