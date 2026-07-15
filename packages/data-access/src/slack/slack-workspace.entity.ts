/**
 * A connected Slack workspace (team). One per `slack` KnowledgeConnector. Owns
 * the OAuth access token (encrypted at rest with ORG_KEY_ENCRYPTION_KEY via
 * secret-encryption.ts) and the set of channels the project may ingest.
 */
export interface SlackWorkspace {
	id: string;
	connectorId: string;
	projectId: string;
	teamId: string;
	teamName: string | null;
	botUserId: string | null;
	scope: string | null;
	/** `iv.authTag.ciphertext` (base64) — never expose raw; decrypt only inside the worker/use case that calls Slack. */
	encryptedAccessToken: string;
	createdAt: Date;
	updatedAt: Date;
}
