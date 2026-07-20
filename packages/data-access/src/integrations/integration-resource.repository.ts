import type { IntegrationResource } from './integration-resource.entity.js';

export interface UpsertIntegrationResourceInput {
	integrationId: string;
	workspaceId?: string | null;
	resourceId: string;
	kind: string;
	name: string;
	private?: boolean;
	metadata?: Record<string, unknown>;
}

export interface IntegrationResourceRepository {
	/** Refresh the inventory: upserts every given resource (clearing removed_at) in one statement. */
	upsertMany(resources: UpsertIntegrationResourceInput[]): Promise<void>;
	listByIntegration(integrationId: string, opts?: { includeRemoved?: boolean }): Promise<IntegrationResource[]>;
	findByResourceId(integrationId: string, resourceId: string): Promise<IntegrationResource | undefined>;
	/** Soft-remove resources that left the grant (permission.changed → removed). */
	markRemoved(integrationId: string, resourceIds: string[]): Promise<void>;
	rename(integrationId: string, resourceId: string, name: string): Promise<void>;
	deleteAllForIntegration(integrationId: string): Promise<void>;
}
