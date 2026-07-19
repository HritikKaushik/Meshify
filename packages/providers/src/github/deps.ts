import type { GitHubInstallation, InstallationRepo, InstallationToken } from '@meshify/github';

/** Meshify's managed GitHub App (operator-configured once per deployment), or an org's BYOA app. */
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
	/** null = deployment has no managed app configured → operations 503 via ProviderNotConfiguredError. */
	app: GitHubAppSettings | null;
	transport: GitHubAppTransport | null;
	now?: () => Date;
}
