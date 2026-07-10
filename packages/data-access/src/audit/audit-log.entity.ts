/** An audit record. Written for every mutating API request (see audit-log.middleware). */
export interface AuditLogEntry {
	orgId: string;
	projectId: string | null;
	/** The API key id that performed the action; null for unauthenticated paths. */
	actorKeyId: string | null;
	action: string;
	resourceType: string;
	resourceId: string;
	ipAddress: string | null;
	metadata: Record<string, unknown>;
}
