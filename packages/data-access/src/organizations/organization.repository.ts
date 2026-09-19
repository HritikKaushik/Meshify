import type { Organization } from './organization.entity.js';

export interface OrganizationRepository {
	findById(id: string): Promise<Organization | undefined>;
}
