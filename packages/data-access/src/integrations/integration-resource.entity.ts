/**
 * One entry of an integration's canonical resource inventory — the cached
 * "what does this grant reach" set (repositories, channels, sites). Maintained
 * by resource listing + permission.changed events; soft-removed on revocation.
 */
export interface IntegrationResource {
	id: string;
	integrationId: string;
	/** Canonical workspace tier; null for flat providers (collapses to the account). */
	workspaceId: string | null;
	resourceId: string;
	kind: string;
	name: string;
	private: boolean;
	metadata: Record<string, unknown>;
	discoveredAt: Date;
	updatedAt: Date;
	removedAt: Date | null;
}
