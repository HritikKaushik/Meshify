import type { IntegrationContext } from './context.js';

/** A selectable resource of a connected grant (a repository, a channel, a site, a drive). */
export interface ProviderResource {
	/** Provider-stable id (GitHub repo id, Slack channel id). */
	id: string;
	name: string;
	kind: string;
	private?: boolean;
	/** Provider-specific display extras (default branch, member count, …). */
	extra?: Record<string, unknown>;
}

export interface ResourcePage {
	resources: ProviderResource[];
	nextCursor?: string;
}

/** Post-connect resource listing — powers the repo/channel/site pickers. */
export interface ResourceBrowsingCapable {
	listResources(ctx: IntegrationContext, cursor?: string): Promise<ResourcePage>;
}
