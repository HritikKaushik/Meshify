import type { IntegrationCredential } from './integration-credential.entity.js';

export interface UpsertIntegrationCredentialInput {
	integrationId: string;
	kind: string;
	encryptedValue: string;
	expiresAt?: Date | null;
}

export interface IntegrationCredentialRepository {
	/** Insert or replace the credential of this kind; replacement stamps `rotated_at`. */
	upsert(input: UpsertIntegrationCredentialInput): Promise<IntegrationCredential>;
	findByIntegrationAndKind(integrationId: string, kind: string): Promise<IntegrationCredential | undefined>;
	listByIntegration(integrationId: string): Promise<IntegrationCredential[]>;
	/** Credentials expiring before `before` — the refresh sweep's work list. */
	listExpiringBefore(before: Date): Promise<IntegrationCredential[]>;
	delete(integrationId: string, kind: string): Promise<void>;
	deleteAllForIntegration(integrationId: string): Promise<void>;
}
