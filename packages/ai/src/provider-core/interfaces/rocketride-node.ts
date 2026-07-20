/**
 * The RocketRide LLM component ids this platform targets. Every one exposes the
 * same `questions → answers` lane wiring, so swapping between them never changes
 * a pipeline's graph shape — only the node's `provider` + `config`. See
 * `.rocketride/schema/llm_*.json` and `packages/rocketride-gateway`.
 */
export type RocketRideLlmComponent =
	| 'llm_openai'
	| 'llm_anthropic'
	| 'llm_gemini'
	| 'llm_openai_api'
	| 'llm_ollama';

/**
 * A vendor-blind description of the RocketRide LLM node the gateway should emit
 * for the active provider. The gateway renders this as a `custom`-profile
 * component with **literal** values (not `${ENV}` placeholders), so per-org BYOA
 * keys resolved from the vault are injected directly. RocketRide never learns
 * which vendor is active — it only receives a component id and config.
 */
export interface ResolvedRocketRideNode {
	component: RocketRideLlmComponent;
	/** Model id for the `custom` profile's `model` field. */
	model: string;
	/** Context window for the `custom` profile's `modelTotalTokens` field. */
	modelTotalTokens: number;
	/** Literal API key for `apikey`. Omitted for keyless providers (e.g. Ollama). */
	apikey?: string;
	/** `base_url` (llm_openai_api) or `serverbase` (llm_ollama). */
	baseUrl?: string;
	/**
	 * Extra `custom`-profile fields specific to a component, e.g. Gemini
	 * `outputTokens`, Ollama `temperature` / `reasoning_effort`.
	 */
	extra?: Record<string, unknown>;
}
