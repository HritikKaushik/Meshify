import type pg from 'pg';
import type { DependencyChecker, DependencyCheckResult } from '../domain/dependency-check.js';

export class PostgresChecker implements DependencyChecker {
	readonly name = 'postgres';

	constructor(private readonly pool: pg.Pool) {}

	async check(): Promise<DependencyCheckResult> {
		const start = performance.now();
		try {
			await this.pool.query('select 1');
			return { name: this.name, status: 'up', latencyMs: performance.now() - start };
		} catch (err) {
			return {
				name: this.name,
				status: 'down',
				latencyMs: performance.now() - start,
				error: (err as Error).message,
			};
		}
	}
}
