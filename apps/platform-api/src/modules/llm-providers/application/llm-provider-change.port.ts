/**
 * Coordinates the in-process caches with LLM provider configuration changes.
 *
 * `notifyChanged` invalidates the resolution cache and the org's cached chat
 * pipelines so the next chat turn rebuilds against the new active provider —
 * called on connect/activate/disconnect.
 *
 * `warmChatPipeline` (re)builds ONE project's chat pipeline on RocketRide and
 * awaits it — the synchronous path activate uses so the UI can block on a
 * multi-step loader until the pipeline is ready, so a user never chats
 * mid-build. Best-effort: returns whether the pipeline warmed, never throws.
 *
 * `warmChatPipelines` warms all of an org's chat pipelines in the background so
 * the first chat in any project is fast. Called (fire-and-forget) on activate.
 */
export interface LlmProviderChangeNotifier {
	notifyChanged(orgId: string): Promise<void>;
	warmChatPipeline(orgId: string, projectId: string): Promise<boolean>;
	warmChatPipelines(orgId: string): Promise<void>;
}
