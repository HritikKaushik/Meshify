import type { Redis } from 'ioredis';
import type { DependencyChecker, DependencyCheckResult } from '../domain/dependency-check.js';

export class RedisChecker implements DependencyChecker {
	readonly name = 'redis';

	constructor(private readonly redis: Redis) {}

	async check(): Promise<DependencyCheckResult> {
		const start = performance.now();
		try {
			await this.redis.ping();
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
