import type { AuditLogEntry } from './audit-log.entity.js';

export interface AuditLogRepository {
	/** Appends one audit record. Auditing must never break the request it records. */
	record(entry: AuditLogEntry): Promise<void>;
}
