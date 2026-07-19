import type { Provider } from '../base/provider.js';
import type { ProviderDescriptor } from '../base/descriptor.js';
import type { CallbackInput, ConnectInput, ConnectResult, CredentialRefresh, OAuthCapable } from '../base/oauth.js';
import type { IntegrationContext } from '../base/context.js';
import type { RawWebhookRequest, WebhookCapable, WebhookDescriptor } from '../base/webhook.js';
import type { HealthCapable, ProviderHealthReport } from '../base/health.js';
import type { ResourceBrowsingCapable, ResourcePage } from '../base/resources.js';
import type { ByoaCapable, ByoaConfigField } from '../base/byoa.js';
import type { PlatformEvent } from '../events/platform-events.js';
import { ProviderAuthError, ProviderConfigError, ProviderNotConfiguredError } from '../base/errors.js';
import { NO_CAPABILITIES } from '../base/descriptor.js';
import type { SlackProviderDeps } from './deps.js';
import { describeSlackWebhook, verifySlackSignature } from './webhooks.js';
import type { SlackOAuthResult } from '@meshify/slack';

const ACCESS_TOKEN_KIND = 'access_token';
const REFRESH_TOKEN_KIND = 'refresh_token';

export const SLACK_DESCRIPTOR: ProviderDescriptor = {
	id: 'slack',
	displayName: 'Slack',
	category: 'chat',
	availability: 'available',
	summary: 'Ingest conversations from selected channels of a Slack workspace.',
	iconKey: 'slack',
	brandColor: '#4A154B',
	docsUrl: 'https://api.slack.com/apis/events-api',
	capabilities: {
		...NO_CAPABILITIES,
		oauth: true,
		webhooks: true,
		resourcePicker: true,
		healthCheck: true,
		byoa: true,
		// Sync + realtime flags flip on with the sync-engine/dispatcher milestones.
	},
};

/**
 * Slack as a Provider: an org-level workspace install via OAuth v2. Supports
 * both non-expiring bot tokens and rotation-enabled apps (refresh token +
 * expiry captured when Slack issues them).
 */
export class SlackProvider implements Provider, OAuthCapable, WebhookCapable, HealthCapable, ResourceBrowsingCapable, ByoaCapable {
	readonly descriptor = SLACK_DESCRIPTOR;
	private readonly now: () => Date;

	constructor(private readonly deps: SlackProviderDeps) {
		this.now = deps.now ?? (() => new Date());
	}

	isConfigured(): boolean {
		return this.deps.app !== null && this.deps.transport !== null;
	}

	private requireTransport() {
		if (!this.deps.transport) throw new ProviderNotConfiguredError('slack', 'No managed Slack app is configured (SLACK_* env)');
		return this.deps.transport;
	}

	// --- OAuthCapable --------------------------------------------------------

	buildConnectUrl(input: ConnectInput): string {
		return this.requireTransport().buildAuthorizeUrl(input.stateToken);
	}

	async completeConnect(input: CallbackInput): Promise<ConnectResult> {
		if (input.params.error) throw new ProviderAuthError(`Slack authorization was not granted: ${input.params.error}`);
		const code = input.params.code;
		if (!code) throw new ProviderAuthError('Slack callback is missing the authorization code');

		let result: SlackOAuthResult;
		try {
			result = await this.requireTransport().exchangeCode(code);
		} catch (err) {
			throw new ProviderAuthError(`Slack code exchange failed: ${(err as Error).message}`);
		}

		return {
			externalAccountId: result.teamId,
			externalAccountName: result.teamName ?? result.teamId,
			metadata: { teamId: result.teamId, botUserId: result.botUserId, scope: result.scope, appId: result.appId },
			credentials: this.credentialsFrom(result),
		};
	}

	/** Rotate an expiring token pair (rotation-enabled apps). Null when the workspace has a non-expiring bot token. */
	async refreshCredentials(ctx: IntegrationContext): Promise<CredentialRefresh | null> {
		const refresh = await ctx.vault.get(REFRESH_TOKEN_KIND);
		if (!refresh) return null;
		let result: SlackOAuthResult;
		try {
			result = await this.requireTransport().refreshToken(refresh.value);
		} catch (err) {
			throw new ProviderAuthError(`Slack token refresh failed: ${(err as Error).message}`);
		}
		return { credentials: this.credentialsFrom(result) };
	}

	async revokeAccess(ctx: IntegrationContext): Promise<void> {
		const token = await ctx.vault.get(ACCESS_TOKEN_KIND);
		if (token) await this.requireTransport().revokeToken(token.value);
	}

	private credentialsFrom(result: SlackOAuthResult) {
		const credentials = [
			{
				kind: ACCESS_TOKEN_KIND,
				value: result.accessToken,
				expiresAt: result.expiresInSeconds ? new Date(this.now().getTime() + result.expiresInSeconds * 1000) : null,
			},
		];
		if (result.refreshToken) credentials.push({ kind: REFRESH_TOKEN_KIND, value: result.refreshToken, expiresAt: null });
		return credentials;
	}

	// --- ResourceBrowsingCapable ---------------------------------------------

	async listResources(ctx: IntegrationContext, _cursor?: string): Promise<ResourcePage> {
		const token = await this.requireAccessToken(ctx);
		const channels = await this.requireTransport().listChannels(token);
		return {
			resources: channels.map((c) => ({ id: c.id, name: c.name, kind: 'channel', private: c.isPrivate })),
		};
	}

	private async requireAccessToken(ctx: IntegrationContext): Promise<string> {
		const token = await ctx.vault.get(ACCESS_TOKEN_KIND);
		if (!token) throw new ProviderAuthError('This Slack workspace has no usable token — reconnect the integration');
		return token.value;
	}

	// --- HealthCapable -------------------------------------------------------

	async checkHealth(ctx: IntegrationContext): Promise<ProviderHealthReport> {
		if (!this.isConfigured()) return { health: 'unknown', detail: { reason: 'provider not configured' } };
		const token = await ctx.vault.get(ACCESS_TOKEN_KIND);
		if (!token) {
			const hasRefresh = (await ctx.vault.get(REFRESH_TOKEN_KIND)) !== undefined;
			return hasRefresh
				? { health: 'token_expired', detail: { reason: 'access token expired; refresh pending' } }
				: { health: 'needs_reauthorization', detail: { reason: 'no stored token' } };
		}
		try {
			const identity = await this.requireTransport().testAuth(token.value);
			return { health: 'healthy', detail: { teamId: identity.teamId, botUserId: identity.botUserId } };
		} catch (err) {
			const message = (err as Error).message;
			if (/invalid_auth|token_revoked|account_inactive/.test(message)) {
				return { health: 'needs_reauthorization', detail: { error: message } };
			}
			return { health: 'unknown', detail: { error: message } };
		}
	}

	// --- WebhookCapable ------------------------------------------------------

	verifyWebhook(req: RawWebhookRequest, secret: string, now?: Date): boolean {
		return verifySlackSignature(req, secret, now ?? this.now());
	}

	describeWebhook(req: RawWebhookRequest): WebhookDescriptor {
		return describeSlackWebhook(req);
	}

	async normalizeWebhook(event: { eventType: string; payload: Record<string, unknown> }, ctx: IntegrationContext): Promise<PlatformEvent[]> {
		const base = { provider: 'slack', integrationId: ctx.integration.id, orgId: ctx.integration.orgId } as const;
		const inner = (event.payload.event ?? {}) as Record<string, unknown>;

		switch (event.eventType) {
			case 'message': {
				const channel = typeof inner.channel === 'string' ? inner.channel : null;
				if (!channel) return [];
				// Every message (threaded or not) just marks the channel active —
				// the debounced incremental sync re-reads history via cursors, so
				// message-level dedup/ordering is the sync's problem, not the bus's.
				return [{ ...base, kind: 'activity.message', channelRef: channel }];
			}
			case 'member_joined_channel': {
				const botUserId = ctx.integration.metadata.botUserId;
				if (typeof inner.user === 'string' && typeof botUserId === 'string' && inner.user === botUserId) {
					const channel = typeof inner.channel === 'string' ? inner.channel : '';
					return [{ ...base, kind: 'grant.changed', added: channel ? [channel] : [], removed: [] }];
				}
				return [];
			}
			case 'channel_rename': {
				const channel = inner.channel as { id?: string; name?: string } | undefined;
				if (!channel?.id || !channel.name) return [];
				return [{ ...base, kind: 'resource.renamed', resourceType: 'channel', externalResourceId: channel.id, name: channel.name }];
			}
			case 'app_uninstalled':
			case 'tokens_revoked':
				return [{ ...base, kind: 'installation.revoked' }];
			default:
				return [];
		}
	}

	// --- ByoaCapable ---------------------------------------------------------

	describeByoaConfig(): ByoaConfigField[] {
		return [
			{ key: 'app_client_id', label: 'Slack app Client ID', secret: false },
			{ key: 'app_client_secret', label: 'Client secret', secret: true },
			{ key: 'app_signing_secret', label: 'Signing secret', secret: true },
		];
	}

	validateByoaConfig(values: Record<string, string>): void {
		for (const field of this.describeByoaConfig()) {
			if (!values[field.key]?.trim()) throw new ProviderConfigError(`${field.label} is required`);
		}
	}
}

export function createSlackProvider(deps: SlackProviderDeps): SlackProvider {
	return new SlackProvider(deps);
}
