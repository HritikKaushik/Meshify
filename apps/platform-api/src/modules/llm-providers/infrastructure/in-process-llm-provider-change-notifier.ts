import type { ProjectRepository } from '@meshify/data-access';
import type { LlmProviderChangeNotifier } from '../application/llm-provider-change.port.js';
import type { ChatPipelineResolver } from '../../chat/application/chat-pipeline.port.js';
import type { LlmResolutionService } from './llm-resolution.service.js';

interface WarmLogger {
	info(obj: Record<string, unknown>, msg: string): void;
	warn(obj: Record<string, unknown>, msg: string): void;
}

/**
 * In-process change propagation + pipeline warming.
 *
 * `notifyChanged` drops the resolution cache for the org and invalidates every
 * one of the org's cached chat pipelines so the next chat turn rebuilds against
 * the new active provider — no server restart.
 *
 * `warmChatPipelines` proactively resolves each of the org's chat pipelines,
 * which builds/reconciles them on RocketRide up front (see PipelineRegistry).
 * Activating a provider triggers this so the first chat message is fast rather
 * than paying the one-time RocketRide setup lazily.
 *
 * Note: like the existing per-project profile-switch behavior, these caches are
 * in-process; in a multi-instance deployment other instances warm on their own
 * next cache miss (documented in the AI Providers backend doc).
 */
export class InProcessLlmProviderChangeNotifier implements LlmProviderChangeNotifier {
	constructor(
		private readonly resolution: LlmResolutionService,
		private readonly projects: ProjectRepository,
		private readonly chatPipelines: ChatPipelineResolver,
		private readonly logger?: WarmLogger
	) {}

	async notifyChanged(orgId: string): Promise<void> {
		this.resolution.invalidate(orgId);
		const projects = await this.projects.findByOrgId(orgId);
		for (const project of projects) {
			this.chatPipelines.invalidate(project);
		}
	}

	/**
	 * Best-effort — never throws. Warms each project's pipeline SEQUENTIALLY: the
	 * process shares ONE RocketRide client (a single WebSocket/DAP connection), so
	 * firing concurrent restart/use calls corrupts the protocol and drops the
	 * connection. Serial warming mirrors how ordinary chat turns use the client.
	 * A per-project failure (e.g. a RocketRide hiccup) is swallowed so it neither
	 * aborts the sweep nor blocks the others — that project just builds lazily on
	 * its first message.
	 */
	async warmChatPipelines(orgId: string): Promise<void> {
		try {
			const projects = await this.projects.findByOrgId(orgId);
			let warmed = 0;
			let failed = 0;
			for (const project of projects) {
				try {
					await this.chatPipelines.resolve(project);
					warmed += 1;
				} catch (err) {
					failed += 1;
					this.logger?.warn({ orgId, projectId: project.id, err: err instanceof Error ? err.message : String(err) }, 'chat pipeline warm failed for project');
				}
			}
			this.logger?.info({ orgId, warmed, failed }, 'warmed chat pipelines after LLM provider activation');
		} catch (err) {
			this.logger?.warn({ orgId, err: err instanceof Error ? err.message : String(err) }, 'chat pipeline warm sweep failed');
		}
	}
}
