import type { IntegrationHealth } from '@meshify/data-access';
import type { IntegrationContext } from './context.js';

export interface ProviderHealthReport {
	health: IntegrationHealth;
	detail?: Record<string, unknown>;
}

/**
 * Active health verification (credential validity, grant liveness, webhook
 * reachability where knowable). Called by the maintenance sweep and after
 * auth-shaped failures; event-driven flips (revocations, 401s) update health
 * without waiting for a sweep.
 */
export interface HealthCapable {
	checkHealth(ctx: IntegrationContext): Promise<ProviderHealthReport>;
}
