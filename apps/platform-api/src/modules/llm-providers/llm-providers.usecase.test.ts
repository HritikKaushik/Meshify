import { describe, it, expect } from 'vitest';
import { CredentialVault, type CredentialStore } from '@meshify/providers';
import { createBuiltInLlmRegistry, type LlmHttpClient } from '@meshify/ai';
import type {
	ActiveLlmProviderRepository,
	LLMProviderConfiguration,
	LlmProviderConfigurationRepository,
	LlmProviderStatus,
	UpsertLlmProviderConfigurationInput,
} from '@meshify/data-access';
import { ConnectLlmProviderUseCase } from './application/connect-llm-provider.usecase.js';
import { ActivateLlmProviderUseCase } from './application/activate-llm-provider.usecase.js';
import { DisconnectLlmProviderUseCase } from './application/disconnect-llm-provider.usecase.js';
import { TestLlmProviderUseCase } from './application/test-llm-provider.usecase.js';
import { LlmResolutionService } from './infrastructure/llm-resolution.service.js';
import { InProcessLlmProviderChangeNotifier } from './infrastructure/in-process-llm-provider-change-notifier.js';
import type { LlmProviderChangeNotifier } from './application/llm-provider-change.port.js';
import type { ChatPipelineResolver } from '../chat/application/chat-pipeline.port.js';
import type { Project } from '@meshify/data-access';

// --- In-memory fakes -----------------------------------------------------------

class MemConfigRepo implements LlmProviderConfigurationRepository {
	readonly rows = new Map<string, LLMProviderConfiguration>();
	private next = 1;
	constructor(private readonly active: Map<string, string>) {}

	async upsert(input: UpsertLlmProviderConfigurationInput): Promise<LLMProviderConfiguration> {
		const existing = [...this.rows.values()].find((r) => r.orgId === input.orgId && r.provider === input.provider);
		const now = new Date();
		if (existing) {
			if (input.status) existing.status = input.status;
			if (input.defaultModel !== undefined) existing.defaultModel = input.defaultModel;
			existing.config = { ...existing.config, ...(input.config ?? {}) };
			existing.updatedAt = now;
			return { ...existing };
		}
		const id = `cfg-${this.next++}`;
		const row: LLMProviderConfiguration = {
			id,
			orgId: input.orgId,
			provider: input.provider,
			status: input.status ?? 'disconnected',
			defaultModel: input.defaultModel ?? null,
			config: input.config ?? {},
			metadata: {},
			lastError: null,
			createdAt: now,
			updatedAt: now,
		};
		this.rows.set(id, row);
		return { ...row };
	}
	async findByOrgAndProvider(orgId: string, provider: string) {
		const r = [...this.rows.values()].find((x) => x.orgId === orgId && x.provider === provider);
		return r ? { ...r } : undefined;
	}
	async findByIdForOrg(id: string, orgId: string) {
		const r = this.rows.get(id);
		return r && r.orgId === orgId ? { ...r } : undefined;
	}
	async findActiveByOrg(orgId: string) {
		const id = this.active.get(orgId);
		const r = id ? this.rows.get(id) : undefined;
		return r ? { ...r } : undefined;
	}
	async listByOrg(orgId: string) {
		return [...this.rows.values()].filter((r) => r.orgId === orgId).map((r) => ({ ...r }));
	}
	async updateStatus(id: string, status: LlmProviderStatus, lastError?: string | null) {
		const r = this.rows.get(id);
		if (r) {
			r.status = status;
			r.lastError = lastError ?? null;
		}
	}
	async updateDefaultModel(id: string, model: string | null) {
		const r = this.rows.get(id);
		if (r) r.defaultModel = model;
	}
	async delete(orgId: string, provider: string) {
		const r = [...this.rows.values()].find((x) => x.orgId === orgId && x.provider === provider);
		if (r) {
			this.rows.delete(r.id);
			if (this.active.get(orgId) === r.id) this.active.delete(orgId); // FK cascade analogue
		}
	}
}

class RecordingNotifier implements LlmProviderChangeNotifier {
	readonly calls: string[] = [];
	readonly warmed: string[] = [];
	async notifyChanged(orgId: string) {
		this.calls.push(orgId);
	}
	async warmChatPipelines(orgId: string) {
		this.warmed.push(orgId);
	}
}

const healthyHttp: LlmHttpClient = {
	async fetch() {
		return { status: 200, ok: true, json: async () => ({ data: [{ id: 'gpt-4.1' }] }), text: async () => '', headers: { get: () => null } };
	},
};

function makeHarness() {
	const active = new Map<string, string>();
	const configs = new MemConfigRepo(active);
	const activeRepo: ActiveLlmProviderRepository = {
		async setActive(orgId, cfgId) {
			active.set(orgId, cfgId);
		},
		async findByOrg(orgId) {
			const id = active.get(orgId);
			return id ? { orgId, configurationId: id, updatedAt: new Date() } : undefined;
		},
		async clear(orgId) {
			active.delete(orgId);
		},
	};
	const secrets = new Map<string, string>();
	const store: CredentialStore = {
		async upsert({ integrationId, kind, encryptedValue }) {
			secrets.set(`${integrationId}:${kind}`, encryptedValue);
		},
		async findByIntegrationAndKind(id, kind) {
			const v = secrets.get(`${id}:${kind}`);
			return v ? { encryptedValue: v, expiresAt: null } : undefined;
		},
		async delete(id, kind) {
			secrets.delete(`${id}:${kind}`);
		},
		async deleteAllForIntegration(id) {
			for (const k of [...secrets.keys()]) if (k.startsWith(`${id}:`)) secrets.delete(k);
		},
	};
	const vault = new CredentialVault(store, { encrypt: (x) => x, decrypt: (x) => x });
	const registry = createBuiltInLlmRegistry({ http: healthyHttp });
	const notifier = new RecordingNotifier();
	return { configs, activeRepo, vault, registry, notifier, secrets };
}

// --- Tests ---------------------------------------------------------------------

describe('ConnectLlmProviderUseCase', () => {
	it('stores the api key in the vault, saves config, defaults the model, and notifies', async () => {
		const h = makeHarness();
		const connect = new ConnectLlmProviderUseCase(h.registry, h.configs, h.vault, h.notifier);
		await connect.execute({ orgId: 'org1', provider: 'openai', values: { api_key: 'sk-test' } });

		const cfg = await h.configs.findByOrgAndProvider('org1', 'openai');
		expect(cfg?.status).toBe('connected');
		expect(cfg?.defaultModel).toBe('gpt-4.1'); // recommended
		expect((await h.vault.get(cfg!.id, 'api_key'))?.value).toBe('sk-test');
		expect(h.notifier.calls).toContain('org1');
	});

	it('rejects a connect with a missing required key without persisting', async () => {
		const h = makeHarness();
		const connect = new ConnectLlmProviderUseCase(h.registry, h.configs, h.vault, h.notifier);
		await expect(connect.execute({ orgId: 'org1', provider: 'openai', values: {} })).rejects.toThrow();
		expect(await h.configs.findByOrgAndProvider('org1', 'openai')).toBeUndefined();
	});
});

describe('ActivateLlmProviderUseCase', () => {
	it('activates a connected provider, notifies, and warms chat pipelines', async () => {
		const h = makeHarness();
		const connect = new ConnectLlmProviderUseCase(h.registry, h.configs, h.vault, h.notifier);
		const activate = new ActivateLlmProviderUseCase(h.registry, h.configs, h.activeRepo, h.vault, h.notifier);
		await connect.execute({ orgId: 'org2', provider: 'openai', values: { api_key: 'sk' } });
		await activate.execute({ orgId: 'org2', provider: 'openai' });
		expect((await h.activeRepo.findByOrg('org2'))?.configurationId).toBeDefined();
		// Activation pre-warms the pipeline so the first chat message is fast.
		expect(h.notifier.warmed).toContain('org2');
	});

	it('refuses to activate a provider that was never connected', async () => {
		const h = makeHarness();
		const activate = new ActivateLlmProviderUseCase(h.registry, h.configs, h.activeRepo, h.vault, h.notifier);
		await expect(activate.execute({ orgId: 'orgX', provider: 'openai' })).rejects.toThrow(/No configuration/);
	});
});

describe('LlmResolutionService', () => {
	it('returns null when no provider is active, and a resolved node when one is', async () => {
		const h = makeHarness();
		const connect = new ConnectLlmProviderUseCase(h.registry, h.configs, h.vault, h.notifier);
		const activate = new ActivateLlmProviderUseCase(h.registry, h.configs, h.activeRepo, h.vault, h.notifier);
		const resolution = new LlmResolutionService(h.registry, h.configs, h.vault);

		expect(await resolution.resolveForOrg('org3')).toBeNull();

		await connect.execute({ orgId: 'org3', provider: 'anthropic', values: { api_key: 'sk-ant' }, defaultModel: 'claude-sonnet-4' });
		await activate.execute({ orgId: 'org3', provider: 'anthropic' });
		resolution.invalidate('org3');

		const resolved = await resolution.resolveForOrg('org3');
		expect(resolved).toMatchObject({ mode: 'resolved', component: 'llm_anthropic', model: 'claude-sonnet-4', apiKey: 'sk-ant' });
		expect(resolved?.modelTotalTokens).toBeGreaterThan(0);
		// Cached: second call returns the same object without recomputing.
		expect(await resolution.resolveForOrg('org3')).toBe(resolved);
	});
});

describe('DisconnectLlmProviderUseCase', () => {
	it('purges credentials + config and clears the active selection (cascade)', async () => {
		const h = makeHarness();
		const connect = new ConnectLlmProviderUseCase(h.registry, h.configs, h.vault, h.notifier);
		const activate = new ActivateLlmProviderUseCase(h.registry, h.configs, h.activeRepo, h.vault, h.notifier);
		const disconnect = new DisconnectLlmProviderUseCase(h.configs, h.vault, h.notifier);

		await connect.execute({ orgId: 'org4', provider: 'openai', values: { api_key: 'sk' } });
		await activate.execute({ orgId: 'org4', provider: 'openai' });
		await disconnect.execute({ orgId: 'org4', provider: 'openai' });

		expect(await h.configs.findByOrgAndProvider('org4', 'openai')).toBeUndefined();
		expect(await h.activeRepo.findByOrg('org4')).toBeUndefined();
		expect([...h.secrets.keys()]).toHaveLength(0);
	});
});

describe('TestLlmProviderUseCase', () => {
	it('reports a healthy provider as ok with discovered models', async () => {
		const h = makeHarness();
		const test = new TestLlmProviderUseCase(h.registry, h.configs, h.vault);
		const result = await test.execute({ orgId: 'org5', provider: 'openai', values: { api_key: 'sk' } });
		expect(result.ok).toBe(true);
		expect(result.models?.length).toBeGreaterThan(0);
	});
});

describe('InProcessLlmProviderChangeNotifier.warmChatPipelines', () => {
	it('resolves every org project pipeline up front and never throws on partial failure', async () => {
		const resolved: string[] = [];
		const projects = [{ id: 'p1' }, { id: 'p2' }] as Project[];
		const projectRepo = { findByOrgId: async () => projects } as unknown as import('@meshify/data-access').ProjectRepository;
		const chatPipelines: ChatPipelineResolver = {
			resolve: async (p: Project) => {
				if (p.id === 'p2') throw new Error('rocketride hiccup');
				resolved.push(p.id);
				return 'tok';
			},
			invalidate: () => {},
		};
		const resolution = { invalidate: () => {} } as unknown as LlmResolutionService;
		const notifier = new InProcessLlmProviderChangeNotifier(resolution, projectRepo, chatPipelines);

		await expect(notifier.warmChatPipelines('org1')).resolves.toBeUndefined();
		expect(resolved).toEqual(['p1']); // p1 warmed; p2 failed but did not abort the sweep
	});
});
