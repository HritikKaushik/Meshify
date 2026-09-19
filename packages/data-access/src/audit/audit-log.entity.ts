export type AuditActorType = 'user' | 'service' | 'system';

/**
 * `http` rows are the generic mutation log (one per mutating API request, see
 * audit-log.middleware). `domain` rows are explicit events - a role change, a
 * membership change - written in the same transaction as the change itself.
 */
export type AuditCategory = 'http' | 'domain';

export interface AuditLogEntry {
	orgId: string;
	projectId: string | null;
	/** The API key the request authenticated with; null for unauthenticated paths. */
	actorKeyId: string | null;
	/** The person who acted (`users.id`). Null for service keys and system work. */
	actorUserId?: string | null;
	actorType?: AuditActorType | null;
	/** Defaults to `http`. */
	category?: AuditCategory;
	action: string;
	resourceType: string;
	resourceId: string;
	ipAddress: string | null;
	metadata: Record<string, unknown>;
}
