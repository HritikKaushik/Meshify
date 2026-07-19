import type { Integration } from '@meshify/data-access';
import type { VaultHandle } from '../base/context.js';
import type { CredentialStore, StoredCredential, SecretCipher } from '../vault/credential-store.port.js';
import type { PlatformEvent, PlatformEventBus, PlatformEventHandler, StampedPlatformEvent } from '../events/platform-events.js';
import type { OAuthStateStore } from '../oauth/state-service.js';
import type { OAuthState } from '@meshify/data-access';
import type { GitHubAppTransport } from '../github/deps.js';
import type { SlackTransport } from '../slack/deps.js';
import type { GitHubInstallation, InstallationRepo } from '@meshify/github';
import type { SlackChannelInfo, SlackOAuthResult } from '@meshify/slack';

export const TEST_EPOCH = new Date('2026-01-01T00:00:00.000Z');

export function buildIntegration(overrides: Partial<Integration> = {}): Integration {
	return {
		id: 'int-1',
		orgId: 'org-1',
		provider: 'github',
		mode: 'managed',
		externalAccountId: '12345',
		externalAccountName: 'acme',
		status: 'active',
		health: 'unknown',
		healthDetail: {},
		healthCheckedAt: null,
		metadata: {},
		lastError: null,
		createdAt: TEST_EPOCH,
		updatedAt: TEST_EPOCH,
		...overrides,
	};
}

/** Reversible marker cipher — asserts values were routed through the cipher without real crypto. */
export const fakeCipher: SecretCipher = {
	encrypt: (plaintext) => `enc(${plaintext})`,
	decrypt: (ciphertext) => {
		const match = /^enc\((.*)\)$/s.exec(ciphertext);
		if (!match) throw new Error(`FakeCipher: not a fake ciphertext: ${ciphertext}`);
		return match[1]!;
	},
};

export class InMemoryCredentialStore implements CredentialStore {
	readonly rows = new Map<string, StoredCredential>();

	private key(integrationId: string, kind: string): string {
		return `${integrationId}:${kind}`;
	}

	async upsert(input: { integrationId: string; kind: string; encryptedValue: string; expiresAt?: Date | null }): Promise<void> {
		this.rows.set(this.key(input.integrationId, input.kind), { encryptedValue: input.encryptedValue, expiresAt: input.expiresAt ?? null });
	}

	async findByIntegrationAndKind(integrationId: string, kind: string): Promise<StoredCredential | undefined> {
		return this.rows.get(this.key(integrationId, kind));
	}

	async delete(integrationId: string, kind: string): Promise<void> {
		this.rows.delete(this.key(integrationId, kind));
	}

	async deleteAllForIntegration(integrationId: string): Promise<void> {
		for (const key of [...this.rows.keys()]) if (key.startsWith(`${integrationId}:`)) this.rows.delete(key);
	}
}

/** Standalone vault handle over a plain map — for tests that don't exercise the CredentialVault itself. */
export function fakeVaultHandle(seed: Record<string, { value: string; expiresAt?: Date | null }> = {}): VaultHandle & { store: Map<string, { value: string; expiresAt: Date | null }> } {
	const store = new Map<string, { value: string; expiresAt: Date | null }>(
		Object.entries(seed).map(([kind, v]) => [kind, { value: v.value, expiresAt: v.expiresAt ?? null }])
	);
	return {
		store,
		async get(kind, opts) {
			const entry = store.get(kind);
			if (!entry) return undefined;
			if (entry.expiresAt && entry.expiresAt.getTime() - Date.now() <= (opts?.minTtlMs ?? 0)) return undefined;
			return entry;
		},
		async put(kind, value, expiresAt) {
			store.set(kind, { value, expiresAt: expiresAt ?? null });
		},
		async delete(kind) {
			store.delete(kind);
		},
	};
}

export class InMemoryPlatformEventBus implements PlatformEventBus {
	readonly published: StampedPlatformEvent[] = [];
	private readonly handlers = new Set<PlatformEventHandler>();

	constructor(private readonly now: () => Date = () => TEST_EPOCH) {}

	async publish(event: PlatformEvent): Promise<void> {
		const stamped = { ...event, at: this.now().toISOString() };
		this.published.push(stamped);
		for (const h of this.handlers) h(stamped);
	}

	subscribe(handler: PlatformEventHandler): () => void {
		this.handlers.add(handler);
		return () => this.handlers.delete(handler);
	}
}

export class InMemoryOAuthStateStore implements OAuthStateStore {
	readonly states = new Map<string, OAuthState>();
	private seq = 0;

	async create(input: Parameters<OAuthStateStore['create']>[0]): Promise<OAuthState> {
		this.seq += 1;
		const state: OAuthState = {
			id: `state-${this.seq}`,
			stateHash: input.stateHash,
			orgId: input.orgId,
			provider: input.provider,
			projectId: input.projectId ?? null,
			intent: input.intent ?? 'connect',
			integrationId: input.integrationId ?? null,
			returnPath: input.returnPath ?? null,
			createdByKeyId: input.createdByKeyId ?? null,
			expiresAt: input.expiresAt,
			consumedAt: null,
			createdAt: TEST_EPOCH,
		};
		this.states.set(input.stateHash, state);
		return state;
	}

	async consumeByHash(stateHash: string, now: Date): Promise<OAuthState | undefined> {
		const state = this.states.get(stateHash);
		if (!state || state.consumedAt || state.expiresAt <= now) return undefined;
		const consumed = { ...state, consumedAt: now };
		this.states.set(stateHash, consumed);
		return consumed;
	}
}

// --- Provider transports ----------------------------------------------------

export interface FakeGitHubSeed {
	installations?: GitHubInstallation[];
	repos?: InstallationRepo[];
}

export class FakeGitHubTransport implements GitHubAppTransport {
	readonly installations = new Map<string, GitHubInstallation>();
	repos: InstallationRepo[] = [];
	tokensMinted = 0;

	constructor(seed: FakeGitHubSeed = {}) {
		for (const i of seed.installations ?? []) this.installations.set(String(i.id), i);
		this.repos = seed.repos ?? [];
	}

	async getInstallation(installationId: string | number): Promise<GitHubInstallation> {
		const installation = this.installations.get(String(installationId));
		if (!installation) throw new Error(`GitHub installation ${installationId} not found for this app: 404 Not Found`);
		return installation;
	}

	async createInstallationToken(installationId: string | number): Promise<{ token: string; expiresAt: Date }> {
		await this.getInstallation(installationId);
		this.tokensMinted += 1;
		return { token: `ghs_fake_${installationId}_${this.tokensMinted}`, expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
	}

	async listInstallationRepos(_installationToken: string): Promise<InstallationRepo[]> {
		return this.repos;
	}
}

export function buildGitHubInstallation(overrides: Partial<GitHubInstallation> = {}): GitHubInstallation {
	return {
		id: 12345,
		account: { id: 999, login: 'acme', type: 'Organization', avatarUrl: null },
		repositorySelection: 'selected',
		suspendedAt: null,
		...overrides,
	};
}

export interface FakeSlackSeedForProvider {
	exchangeResult?: SlackOAuthResult;
	channels?: SlackChannelInfo[];
	authTestFails?: string | null;
}

export class FakeSlackTransport implements SlackTransport {
	exchangeResult: SlackOAuthResult;
	channels: SlackChannelInfo[];
	authTestFails: string | null;
	revoked: string[] = [];
	refreshCalls = 0;

	constructor(seed: FakeSlackSeedForProvider = {}) {
		this.exchangeResult = seed.exchangeResult ?? {
			accessToken: 'xoxb-fake',
			teamId: 'T111',
			teamName: 'Acme',
			botUserId: 'U-bot',
			scope: 'channels:read',
			refreshToken: null,
			expiresInSeconds: null,
			appId: 'A111',
		};
		this.channels = seed.channels ?? [{ id: 'C1', name: 'general', isPrivate: false }];
		this.authTestFails = seed.authTestFails ?? null;
	}

	buildAuthorizeUrl(state: string): string {
		return `https://slack.com/oauth/v2/authorize?client_id=fake&state=${encodeURIComponent(state)}`;
	}

	async exchangeCode(code: string): Promise<SlackOAuthResult> {
		if (code !== 'valid-code') throw new Error('invalid_code');
		return this.exchangeResult;
	}

	async refreshToken(_refreshToken: string): Promise<SlackOAuthResult> {
		this.refreshCalls += 1;
		return { ...this.exchangeResult, accessToken: `xoxb-refreshed-${this.refreshCalls}`, refreshToken: 'xoxe-next', expiresInSeconds: 43200 };
	}

	async listChannels(_token: string): Promise<SlackChannelInfo[]> {
		return this.channels;
	}

	async testAuth(_token: string): Promise<{ teamId: string; teamName: string | null; botUserId: string | null }> {
		if (this.authTestFails) throw new Error(`Slack auth.test rejected: ${this.authTestFails}`);
		return { teamId: this.exchangeResult.teamId, teamName: this.exchangeResult.teamName, botUserId: this.exchangeResult.botUserId };
	}

	async revokeToken(token: string): Promise<boolean> {
		this.revoked.push(token);
		return true;
	}
}
