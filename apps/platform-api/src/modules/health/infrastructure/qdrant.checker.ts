import type { DependencyChecker, DependencyCheckResult } from '../domain/dependency-check.js';

export class QdrantChecker implements DependencyChecker {
	readonly name = 'qdrant';

	constructor(
		private readonly baseUrl: string,
		private readonly apiKey?: string
	) {}

	async check(): Promise<DependencyCheckResult> {
		const start = performance.now();
		try {
			const res = await fetch(new URL('/healthz', this.baseUrl), {
				headers: this.apiKey ? { 'api-key': this.apiKey } : undefined,
				signal: AbortSignal.timeout(2000),
			});
			if (!res.ok) throw new Error(`Qdrant health endpoint returned ${res.status}`);
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
