import type { Queryable } from '../db/queryable.js';
import type { AuditLogEntry } from './audit-log.entity.js';
import type { AuditLogRepository } from './audit-log.repository.js';

export class PostgresAuditLogRepository implements AuditLogRepository {
	/** A `Queryable`, so a domain event can join the transaction of the change it records. */
	constructor(private readonly pool: Queryable) {}

	async record(entry: AuditLogEntry): Promise<void> {
		await this.pool.query(
			`insert into audit_logs (org_id, project_id, actor_key_id, action, resource_type, resource_id, ip_address, metadata, actor_id, actor_type, category)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
			[
				entry.orgId,
				entry.projectId,
				entry.actorKeyId,
				entry.action,
				entry.resourceType,
				entry.resourceId,
				entry.ipAddress,
				JSON.stringify(entry.metadata),
				entry.actorUserId ?? null,
				entry.actorType ?? null,
				entry.category ?? 'http',
			]
		);
	}

	async deleteBefore(before: Date): Promise<number> {
		const result = await this.pool.query('delete from audit_logs where created_at < $1', [before]);
		return result.rowCount ?? 0;
	}
}
