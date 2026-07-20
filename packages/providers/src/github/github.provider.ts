import type { Provider } from '../base/provider.js';
import type { ProviderManifest } from '../base/manifest.js';
import type { CallbackInput, ConnectInput, ConnectResult, OAuthCapable } from '../base/oauth.js';
import type { IntegrationContext, RegistrationContext } from '../base/context.js';
import type { GitHubAppSettings, GitHubAppTransport } from './deps.js';
import type { SyncCapable, SyncContext } from '../base/sync.js';
import type { KnowledgeSink } from '../base/knowledge.js';
import { executeGitHubSync } from './sync.js';
import type { RawWebhookRequest, WebhookCapable, WebhookDescriptor } from '../base/webhook.js';
import type { HealthCapable, ProviderHealthReport } from '../base/health.js';
import type { ResourceBrowsingCapable, ResourcePage } from '../base/resources.js';
import type { ByoaCapable, ByoaConfigField } from '../base/byoa.js';
import type { PlatformEvent } from '../events/platform-events.js';
import { ProviderAuthError, ProviderConfigError, ProviderNotConfiguredError } from '../base/errors.js';
import { CURRENT_MANIFEST_VERSION, NO_CAPABILITIES } from '../base/manifest.js';
import type { GitHubProviderDeps } from './deps.js';
import { describeGitHubWebhook, verifyGitHubSignature } from './webhooks.js';
import { readString } from '../base/config.js';

const INSTALLATION_TOKEN_KIND = 'installation_token';
/** Treat an installation token expiring within 5 min as absent — mint a fresh one. */
const TOKEN_MIN_TTL_MS = 5 * 60 * 1000;

export const GITHUB_MANIFEST: ProviderManifest = {
	id: 'github',
	manifestVersion: CURRENT_MANIFEST_VERSION,
	providerVersion: '1.0.0',
	displayName: 'GitHub',
	category: 'code',
	availability: 'available',
	summary: 'Index repositories from a GitHub organization or user account.',
	iconKey: 'github',
	brandColor: '#24292F',
	docsUrl: 'https://docs.github.com/en/apps',
	auth: { type: 'app_install', scopes: ['contents:read', 'metadata:read'] },
	webhookEvents: ['push', 'installation', 'installation_repositories', 'repository', 'ping'],
	capabilities: {
		...NO_CAPABILITIES,
		oauth: true,
		webhooks: true,
		resourcePicker: true,
		healthCheck: true,
		byoa: true,
		fullSync: true,
		incrementalSync: true,
		manualSync: true,
		realtimeEvents: true,
		scheduledSync: true,
		// tools stays false until a tools milestone ships real ones.
	},
};

/**
 * GitHub as a Provider: org-level connect is a GitHub App INSTALLATION (not a
 * user OAuth grant) — the callback carries a guessable installation_id, so the
 * platform only ever binds installations through a state-carrying flow and
 * this provider re-verifies the installation against the App JWT.
 */
export class GitHubProvider implements Provider, OAuthCapable, WebhookCapable, HealthCapable, ResourceBrowsingCapable, ByoaCapable, SyncCapable {
	readonly manifest = GITHUB_MANIFEST;
	private readonly now: () => Date;

	constructor(private readonly deps: GitHubProviderDeps) {
		this.now = deps.now ?? (() => new Date());
	}

	/** Resolve GitHub App settings from the registration (uniform keys across managed and BYOA). */
	private async appSettings(registration: RegistrationContext): Promise<GitHubAppSettings> {
		const appId = readString(registration.config, 'app_id');
		const slug = readString(registration.config, 'app_slug');
		const clientId = readString(registration.config, 'app_client_id');
		const privateKey = (await registration.secrets.get('app_private_key'))?.value;
		const webhookSecret = (await registration.secrets.get('app_webhook_secret'))?.value ?? '';
		const clientSecret = (await registration.secrets.get('app_client_secret'))?.value ?? '';
		if (!appId || !slug || !privateKey) {
			throw new ProviderNotConfiguredError('github', `The GitHub app registration (${registration.mode}) is missing app_id, app_slug, or the private key`);
		}
		return { appId, slug, privateKey, webhookSecret, clientId, clientSecret };
	}

	private async transport(registration: RegistrationContext): Promise<GitHubAppTransport> {
		return this.deps.transportFactory(await this.appSettings(registration));
	}

	// --- OAuthCapable --------------------------------------------------------

	buildConnectUrl(input: ConnectInput, registration: RegistrationContext): string {
		const clientId = readString(registration.config, 'app_client_id');
		const slug = readString(registration.config, 'app_slug');
		// Prefer the user-authorization flow: `/login/oauth/authorize` ALWAYS
		// issues an OAuth `code` (which we need to prove installation ownership)
		// and lets the user install the app inline when it isn't yet installed.
		// `installations/new` short-circuits for already-installed accounts,
		// bouncing back with NO code — so a reconnect there can never be verified.
		if (clientId) {
			return `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&state=${encodeURIComponent(input.stateToken)}`;
		}
		// No OAuth client configured — fall back to the install URL (ownership
		// verification in completeConnect will then reject the code-less callback).
		if (!slug) throw new ProviderNotConfiguredError('github', `The GitHub app registration (${registration.mode}) is missing app_slug and app_client_id`);
		return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(input.stateToken)}`;
	}

	async completeConnect(input: CallbackInput, registration: RegistrationContext): Promise<ConnectResult> {
		const settings = await this.appSettings(registration);
		const transport = this.deps.transportFactory(settings);

		// OWNERSHIP CHECK (critical for tenant isolation): installation ids are
		// guessable sequential integers, and getInstallation via the App JWT only
		// proves the installation EXISTS on the shared app — not that the caller
		// controls it. Require the user-authorization `code` (issued by GitHub
		// only to the user who just authorized), exchange it, and enumerate the
		// installations that user actually administers. Without this an attacker
		// could claim another org's installation by guessing its id.
		if (!settings.clientId || !settings.clientSecret) {
			throw new ProviderNotConfiguredError('github', 'GitHub App user authorization (client id/secret) is not configured — cannot verify installation ownership');
		}
		const code = input.params.code;
		if (!code) {
			throw new ProviderAuthError('GitHub connect did not include user authorization — reconnect and approve access when prompted');
		}
		let accessible: Set<string>;
		try {
			const userToken = await transport.exchangeUserCode(code);
			accessible = await transport.listUserInstallationIds(userToken);
		} catch (err) {
			throw new ProviderAuthError(`GitHub user authorization could not be verified: ${(err as Error).message}`);
		}

		// Resolve which installation to connect. The install flow returns it as a
		// callback param; the user-authorization flow does not, so fall back to
		// the single installation the user administers through this app.
		let installationId = input.params.installation_id ?? '';
		if (installationId) {
			if (!/^\d+$/.test(installationId)) throw new ProviderAuthError('GitHub callback included an invalid installation_id');
			if (!accessible.has(installationId)) throw new ProviderAuthError('You do not have access to this GitHub installation');
		} else if (accessible.size === 1) {
			installationId = [...accessible][0]!;
		} else if (accessible.size === 0) {
			throw new ProviderAuthError('This GitHub app is not installed on your account yet — install it (Configure → Install), then reconnect');
		} else {
			throw new ProviderAuthError('You administer several installations of this app — open the specific one on GitHub and use “Configure” to connect it');
		}

		// Ownership proven; read the installation's account identity via the App JWT.
		let installation;
		try {
			installation = await transport.getInstallation(installationId);
		} catch (err) {
			throw new ProviderAuthError(`GitHub installation could not be verified: ${(err as Error).message}`);
		}
		if (installation.suspendedAt) {
			throw new ProviderAuthError('This GitHub installation is suspended — unsuspend it on GitHub and reconnect');
		}

		return {
			externalAccountId: String(installation.id),
			externalAccountName: installation.account.login,
			metadata: {
				installationId: installation.id,
				accountId: installation.account.id,
				accountLogin: installation.account.login,
				accountType: installation.account.type,
				avatarUrl: installation.account.avatarUrl,
				repositorySelection: installation.repositorySelection,
				setupAction: input.params.setup_action ?? null,
			},
			// Installation tokens are short-lived and minted on demand into the
			// vault — a completed connect stores no long-lived secret at all.
			credentials: [],
		};
	}

	async revokeAccess(_ctx: IntegrationContext): Promise<void> {
		// Uninstalling the app is a GitHub-side action; there is no token to
		// revoke (installation tokens expire within the hour on their own).
	}

	// --- Token orchestration (shared by resources/health/sync) ---------------

	/** DB-cached installation token: every worker/replica shares one token per installation via the vault. Minted with the registration's app. */
	async getInstallationToken(ctx: IntegrationContext): Promise<string> {
		const cached = await ctx.vault.get(INSTALLATION_TOKEN_KIND, { minTtlMs: TOKEN_MIN_TTL_MS });
		if (cached) return cached.value;
		const transport = await this.transport(ctx.registration);
		const minted = await transport.createInstallationToken(this.installationIdOf(ctx));
		await ctx.vault.put(INSTALLATION_TOKEN_KIND, minted.token, minted.expiresAt);
		return minted.token;
	}

	private installationIdOf(ctx: IntegrationContext): string {
		// external_account_id IS the installation id for github integrations.
		return ctx.integration.externalAccountId;
	}

	// --- SyncCapable ---------------------------------------------------------

	async executeSync(ctx: SyncContext, sink: KnowledgeSink): Promise<void> {
		if (!this.deps.sync) throw new ProviderNotConfiguredError('github', 'GitHub sync is not wired in this process (worker-only)');
		await executeGitHubSync(this.deps.sync, ctx, sink);
	}

	// --- ResourceBrowsingCapable ---------------------------------------------

	async listResources(ctx: IntegrationContext, _cursor?: string): Promise<ResourcePage> {
		const token = await this.getInstallationToken(ctx);
		const repos = await (await this.transport(ctx.registration)).listInstallationRepos(token);
		return {
			resources: repos.map((r) => ({
				id: String(r.id),
				name: r.fullName,
				kind: 'repository',
				private: r.private,
				extra: { owner: r.owner, shortName: r.name, defaultBranch: r.defaultBranch, description: r.description },
			})),
		};
	}

	// --- HealthCapable -------------------------------------------------------

	async checkHealth(ctx: IntegrationContext): Promise<ProviderHealthReport> {
		try {
			const installation = await (await this.transport(ctx.registration)).getInstallation(this.installationIdOf(ctx));
			if (installation.suspendedAt) {
				return { health: 'needs_reauthorization', detail: { suspendedAt: installation.suspendedAt } };
			}
			return { health: 'healthy', detail: { repositorySelection: installation.repositorySelection } };
		} catch (err) {
			const message = (err as Error).message;
			if (message.includes('404')) return { health: 'disconnected', detail: { reason: 'installation no longer exists' } };
			return { health: 'unknown', detail: { error: message } };
		}
	}

	// --- WebhookCapable ------------------------------------------------------

	verifyWebhook(req: RawWebhookRequest, secret: string, _now?: Date): boolean {
		return verifyGitHubSignature(req, secret);
	}

	describeWebhook(req: RawWebhookRequest): WebhookDescriptor {
		return describeGitHubWebhook(req);
	}

	async normalizeWebhook(event: { eventType: string; payload: Record<string, unknown> }, ctx: IntegrationContext): Promise<PlatformEvent[]> {
		const base = { provider: 'github', integrationId: ctx.integration.id, orgId: ctx.integration.orgId } as const;
		const payload = event.payload;

		if (event.eventType === 'push') {
			const repository = payload.repository as { id: number; full_name: string; name: string; default_branch: string; owner?: { login?: string } } | undefined;
			const ref = payload.ref as string | undefined;
			if (!repository || !ref) return [];
			// Only default-branch pushes reindex — feature branches are noise for a knowledge graph.
			if (ref !== `refs/heads/${repository.default_branch}`) return [];
			return [
				{
					...base,
					kind: 'resource.updated',
					resourceType: 'repository',
					externalResourceId: String(repository.id),
					hint: {
						afterSha: payload.after,
						fullName: repository.full_name,
						owner: repository.owner?.login,
						name: repository.name,
						defaultBranch: repository.default_branch,
					},
				},
			];
		}

		if (event.eventType === 'installation.deleted') return [{ ...base, kind: 'connection.revoked' }];
		if (event.eventType === 'installation.suspend') return [{ ...base, kind: 'connection.suspended' }];
		if (event.eventType === 'installation.unsuspend') {
			return [{ ...base, kind: 'health.changed', health: 'healthy' }];
		}

		if (event.eventType.startsWith('installation_repositories.')) {
			const added = ((payload.repositories_added as Array<{ id: number }> | undefined) ?? []).map((r) => String(r.id));
			const removed = ((payload.repositories_removed as Array<{ id: number }> | undefined) ?? []).map((r) => String(r.id));
			return [{ ...base, kind: 'permission.changed', added, removed }];
		}

		if (event.eventType === 'repository.renamed') {
			const repository = payload.repository as { id: number; full_name: string } | undefined;
			if (!repository) return [];
			const changes = payload.changes as { repository?: { name?: { from?: string } } } | undefined;
			return [
				{
					...base,
					kind: 'resource.renamed',
					resourceType: 'repository',
					externalResourceId: String(repository.id),
					name: repository.full_name,
					previousName: changes?.repository?.name?.from,
				},
			];
		}

		if (event.eventType === 'repository.deleted') {
			const repository = payload.repository as { id: number } | undefined;
			if (!repository) return [];
			return [{ ...base, kind: 'resource.removed', resourceType: 'repository', externalResourceId: String(repository.id) }];
		}

		return [];
	}

	// --- ByoaCapable ---------------------------------------------------------

	describeByoaConfig(): ByoaConfigField[] {
		return [
			{ key: 'app_id', label: 'GitHub App ID', secret: false, placeholder: '123456' },
			{ key: 'app_slug', label: 'GitHub App slug', secret: false, placeholder: 'acme-meshify' },
			{ key: 'app_client_id', label: 'OAuth Client ID', secret: false, placeholder: 'Iv1.0123456789abcdef' },
			{ key: 'app_private_key', label: 'Private key (PEM)', secret: true, multiline: true },
			{ key: 'app_client_secret', label: 'OAuth Client secret', secret: true },
			{ key: 'app_webhook_secret', label: 'Webhook secret', secret: true },
		];
	}

	validateByoaConfig(values: Record<string, string>): void {
		for (const field of this.describeByoaConfig()) {
			if (!values[field.key]?.trim()) throw new ProviderConfigError(`${field.label} is required`);
		}
		if (!/^\d+$/.test(values.app_id!.trim())) throw new ProviderConfigError('GitHub App ID must be numeric');
		if (!values.app_private_key!.includes('PRIVATE KEY')) throw new ProviderConfigError('Private key must be a PEM-encoded RSA key');
	}
}

export function createGitHubProvider(deps: GitHubProviderDeps): GitHubProvider {
	return new GitHubProvider(deps);
}

