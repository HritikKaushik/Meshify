import type pg from 'pg';
import type { AuditLogEntry } from './audit-log.entity.js';
import type { AuditLogRepository } from './audit-log.repository.js';

export class PostgresAuditLogRepository implements AuditLogRepository {
	constructor(private readonly pool: pg.Pool) {}

	async record(entry: AuditLogEntry): Promise<void> {
		await this.pool.query(
			`insert into audit_logs (org_id, project_id, actor_key_id, action, resource_type, resource_id, ip_address, metadata)
			 values ($1, $2, $3, $4, $5, $6, $7, $8)`,
			[
				entry.orgId,
				entry.projectId,
				entry.actorKeyId,
				entry.action,
				entry.resourceType,
				entry.resourceId,
				entry.ipAddress,
				JSON.stringify(entry.metadata),
			]
		);
	}

	async deleteBefore(before: Date): Promise<number> {
		const result = await this.pool.query('delete from audit_logs where created_at < $1', [before]);
		return result.rowCount ?? 0;
	}
}
