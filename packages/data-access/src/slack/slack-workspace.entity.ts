/**
 * A project's attachment of a Slack workspace (team). One per `slack`
 * KnowledgeConnector. The bot token lives on the org-level Integration (in
 * `integration_credentials`, via the CredentialVault); the legacy per-workspace
 * `encryptedAccessToken` remains only as a decrypt fallback for pre-platform rows.
 */
export interface SlackWorkspace {
	id: string;
	connectorId: string;
	projectId: string;
	/** The org-level `slack` Integration this workspace draws its token from. Null only for pre-platform rows. */
	integrationId: string | null;
	teamId: string;
	teamName: string | null;
	botUserId: string | null;
	scope: string | null;
	/** Legacy `iv.authTag.ciphertext` envelope — never expose raw; superseded by the vault, dropped in a later migration. */
	encryptedAccessToken: string | null;
	createdAt: Date;
	updatedAt: Date;
}
