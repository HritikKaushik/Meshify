import type { DependencyChecker, DependencyCheckResult } from '../domain/dependency-check.js';

export interface HealthReport {
	status: 'ok' | 'degraded';
	dependencies: DependencyCheckResult[];
}

export class CheckHealthUseCase {
	constructor(private readonly checkers: DependencyChecker[]) {}

	async execute(): Promise<HealthReport> {
		const dependencies = await Promise.all(this.checkers.map((checker) => checker.check()));
		const status = dependencies.every((d) => d.status === 'up') ? 'ok' : 'degraded';
		return { status, dependencies };
	}
}
