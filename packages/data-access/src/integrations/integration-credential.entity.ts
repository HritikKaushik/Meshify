/**
 * One encrypted secret of an integration, keyed by kind. Kinds are
 * provider-defined: `access_token`, `refresh_token`, `installation_token`
 * (short-lived, DB-cached so all workers share it), `webhook_secret`, and the
 * BYOA app kinds (`app_private_key`, `app_client_secret`, `app_signing_secret`).
 *
 * `encryptedValue` is a versioned AES-256-GCM envelope (`v1.iv.tag.ct`) —
 * never expose it; decryption happens only inside the CredentialVault.
 */
export interface IntegrationCredential {
	id: string;
	integrationId: string;
	kind: string;
	encryptedValue: string;
	/** null = non-expiring (e.g. a Slack bot token without rotation enabled). */
	expiresAt: Date | null;
	rotatedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}
