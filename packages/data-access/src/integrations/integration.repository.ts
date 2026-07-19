import type { Integration, IntegrationHealth, IntegrationMode, IntegrationStatus } from './integration.entity.js';

export interface CreateIntegrationInput {
	id?: string;
	orgId: string;
	provider: string;
	mode?: IntegrationMode;
	externalAccountId: string;
	externalAccountName?: string;
	status?: IntegrationStatus;
	metadata?: Record<string, unknown>;
}

export interface IntegrationRepository {
	create(input: CreateIntegrationInput): Promise<Integration>;
	findById(id: string): Promise<Integration | undefined>;
	/** Org-scoped lookup — cross-org probes look identical to missing rows. */
	findByIdForOrg(id: string, orgId: string): Promise<Integration | undefined>;
	findByOrgProviderAccount(orgId: string, provider: string, externalAccountId: string): Promise<Integration | undefined>;
	/** Webhook routing: all claims of a provider grant, across orgs. */
	findByProviderAccount(provider: string, externalAccountId: string): Promise<Integration[]>;
	listByOrg(orgId: string): Promise<Integration[]>;
	listActiveByProvider(provider: string): Promise<Integration[]>;
	updateStatus(id: string, status: IntegrationStatus, lastError?: string | null): Promise<void>;
	updateHealth(id: string, health: IntegrationHealth, detail?: Record<string, unknown>): Promise<void>;
	/** Refresh display name + merge provider metadata after (re)connect or account rename. */
	updateAccountInfo(id: string, input: { externalAccountName?: string; metadata?: Record<string, unknown> }): Promise<void>;
	delete(id: string): Promise<void>;
}
