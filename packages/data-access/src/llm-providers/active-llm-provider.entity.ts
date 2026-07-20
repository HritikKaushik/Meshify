/**
 * The single active LLM provider for an organization. Exactly one row per org
 * (org_id is the primary key), so "only one provider can be active" is a
 * database invariant, not application logic. The active provider is what the
 * RocketRide resolution layer injects into chat/completion pipelines.
 */
export interface ActiveLLMProvider {
	orgId: string;
	configurationId: string;
	updatedAt: Date;
}
