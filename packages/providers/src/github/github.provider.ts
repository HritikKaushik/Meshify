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
		const appId = strOf(registration.config.app_id);
		const slug = strOf(registration.config.app_slug);
		const privateKey = (await registration.secrets.get('app_private_key'))?.value;
		const webhookSecret = (await registration.secrets.get('app_webhook_secret'))?.value ?? '';
		if (!appId || !slug || !privateKey) {
			throw new ProviderNotConfiguredError('github', `The GitHub app registration (${registration.mode}) is missing app_id, app_slug, or the private key`);
		}
		return { appId, slug, privateKey, webhookSecret };
	}

	private async transport(registration: RegistrationContext): Promise<GitHubAppTransport> {
		return this.deps.transportFactory(await this.appSettings(registration));
	}

	// --- OAuthCapable --------------------------------------------------------

	buildConnectUrl(input: ConnectInput, registration: RegistrationContext): string {
		const slug = strOf(registration.config.app_slug);
		if (!slug) throw new ProviderNotConfiguredError('github', `The GitHub app registration (${registration.mode}) is missing app_slug`);
		// installations/new also short-circuits for already-installed accounts,
		// bouncing straight back to the setup URL with state intact — which is
		// how direct-from-GitHub installs get claimed safely.
		return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(input.stateToken)}`;
	}

	async completeConnect(input: CallbackInput, registration: RegistrationContext): Promise<ConnectResult> {
		const transport = await this.transport(registration);
		const installationId = input.params.installation_id;
		if (!installationId || !/^\d+$/.test(installationId)) {
			throw new ProviderAuthError('GitHub callback is missing a valid installation_id');
		}

		// Never trust the bare id: confirm this installation exists on OUR app
		// and read its account identity via the App JWT.
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
			{ key: 'app_private_key', label: 'Private key (PEM)', secret: true, multiline: true },
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

function strOf(value: unknown): string {
	return typeof value === 'string' ? value : value == null ? '' : String(value);
}
