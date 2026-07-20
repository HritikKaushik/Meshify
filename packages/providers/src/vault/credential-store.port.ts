/**
 * Storage port of the credential vault. The shipped implementation is the
 * Postgres `integration_credentials` repository (satisfied structurally at the
 * composition root); KMS/ASM/HashiCorp-Vault backends slot in behind this same
 * port without touching any caller.
 */
export interface StoredCredential {
	encryptedValue: string;
	expiresAt: Date | null;
}

export interface CredentialStore {
	upsert(input: { integrationId: string; kind: string; encryptedValue: string; expiresAt?: Date | null }): Promise<unknown>;
	findByIntegrationAndKind(integrationId: string, kind: string): Promise<StoredCredential | undefined>;
	delete(integrationId: string, kind: string): Promise<void>;
	deleteAllForIntegration(integrationId: string): Promise<void>;
}

/**
 * Symmetric encryption port. The shipped implementation wraps data-access's
 * versioned AES-256-GCM envelope helpers with the operator key baked in.
 */
export interface SecretCipher {
	encrypt(plaintext: string): string;
	decrypt(ciphertext: string): string;
}
