export type DependencyStatus = 'up' | 'down';

export interface DependencyCheckResult {
	name: string;
	status: DependencyStatus;
	latencyMs: number;
	error?: string;
}

export interface DependencyChecker {
	readonly name: string;
	check(): Promise<DependencyCheckResult>;
}
