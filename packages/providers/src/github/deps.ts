import type { GitHubInstallation, InstallationRepo, InstallationToken } from '@meshify/github';

/** GitHub App settings resolved from a provider registration (managed env or BYOA row). */
export interface GitHubAppSettings {
	appId: string;
	privateKey: string;
	/** App slug — builds https://github.com/apps/<slug>/installations/new. */
	slug: string;
	webhookSecret: string;
}

/** Structural transport port over @meshify/github's app client — fakeable in tests. */
export interface GitHubAppTransport {
	getInstallation(installationId: string | number): Promise<GitHubInstallation>;
	createInstallationToken(installationId: string | number): Promise<InstallationToken>;
	listInstallationRepos(installationToken: string): Promise<InstallationRepo[]>;
}

export interface GitHubProviderDeps {
	/** Builds a transport from app settings resolved per-operation from the registration (managed or BYOA). */
	transportFactory: (settings: GitHubAppSettings) => GitHubAppTransport;
	/** Content-sync wiring (detail ports + repo transport) — provided by the worker only. */
	sync?: import('./sync.js').GitHubSyncDeps;
	now?: () => Date;
}
