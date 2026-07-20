/**
 * Coordinates the in-process caches with LLM provider configuration changes.
 *
 * `notifyChanged` invalidates the resolution cache and the org's cached chat
 * pipelines so the next chat turn rebuilds against the new active provider —
 * called on connect/activate/disconnect.
 *
 * `warmChatPipelines` proactively (re)builds the org's chat pipelines on
 * RocketRide so the FIRST chat message after a provider switch is fast, instead
 * of paying the one-time pipeline setup cost lazily. Called on activate. Must
 * never throw — warming is best-effort — so callers can fire it and forget.
 */
export interface LlmProviderChangeNotifier {
	notifyChanged(orgId: string): Promise<void>;
	warmChatPipelines(orgId: string): Promise<void>;
}
