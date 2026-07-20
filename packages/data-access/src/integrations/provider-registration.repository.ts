import type { ProviderRegistration } from './provider-registration.entity.js';

export interface ProviderRegistrationRepository {
	/** Create or update the org's BYOA registration for a provider (merges config). */
	upsert(input: { orgId: string; provider: string; config: Record<string, unknown> }): Promise<ProviderRegistration>;
	findByOrgAndProvider(orgId: string, provider: string): Promise<ProviderRegistration | undefined>;
	findById(id: string): Promise<ProviderRegistration | undefined>;
	listByOrg(orgId: string): Promise<ProviderRegistration[]>;
	delete(orgId: string, provider: string): Promise<void>;
}
