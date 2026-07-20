import type { LlmProvider } from '../../provider-core/interfaces/llm-provider.js';
import type { LlmProviderManifest } from '../../provider-core/interfaces/llm-manifest.js';
import { AI_MANIFEST_VERSION } from '../../provider-core/interfaces/llm-manifest.js';
import type { ModelInfo } from '../../provider-core/interfaces/model.js';
import type { LlmCredentials, ResolveNodeInput, TestConnectionResult } from '../../provider-core/interfaces/llm-capability.js';
import type { ResolvedRocketRideNode } from '../../provider-core/interfaces/rocketride-node.js';
import type { LlmHttpClient } from '../../provider-core/interfaces/transport.js';
import { withTimeout } from '../../provider-core/interfaces/transport.js';
import { LlmUnavailableError } from '../../provider-core/interfaces/errors.js';
import { contextTokensFor, mapHttpError, rocketrideTokenBudget } from '../shared/http.js';
import { toFailure } from '../shared/openai-compatible.js';
import { bearerHeaders, optionalConfig, requireSecret, resolveDeps, trimTrailingSlash, type LlmProviderDeps } from '../shared/deps.js';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const FALLBACK_CONTEXT = 128_000;
const TIMEOUT_MS = 12_000;

export const OPENROUTER_SEED_MODELS: ModelInfo[] = [
	{ id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', contextTokens: 200_000, recommended: true },
	{ id: 'openai/gpt-4.1', label: 'GPT-4.1', contextTokens: 1_047_576 },
	{ id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextTokens: 1_048_576 },
	{ id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', contextTokens: 131_072 },
];

export const OPENROUTER_MANIFEST: LlmProviderManifest = {
	id: 'openrouter',
	manifestVersion: AI_MANIFEST_VERSION,
	providerVersion: '1.0.0',
	displayName: 'OpenRouter',
	summary: 'One API key, hundreds of models across providers. Models fetched live.',
	iconKey: 'openrouter',
	brandColor: '#6467F2',
	docsUrl: 'https://openrouter.ai/docs',
	auth: 'api_key',
	credentialFields: [
		{ key: 'api_key', label: 'API key', secret: true, placeholder: 'sk-or-...' },
		{ key: 'base_url', label: 'Base URL', secret: false, optional: true, placeholder: DEFAULT_BASE_URL, hint: 'Override only for a self-hosted gateway.' },
	],
	modelSource: 'dynamic',
	allowCustomModel: true,
};

interface OpenRouterModelsResponse {
	data?: Array<{ id?: string; name?: string; context_length?: number }>;
}

export class OpenRouterProvider implements LlmProvider {
	readonly manifest = OPENROUTER_MANIFEST;
	private readonly http: LlmHttpClient;
	private readonly now: () => number;

	constructor(deps?: LlmProviderDeps) {
		const resolved = resolveDeps(deps);
		this.http = resolved.http;
		this.now = resolved.now;
	}

	defaultModels(): ModelInfo[] {
		return OPENROUTER_SEED_MODELS;
	}

	private baseUrl(credentials: LlmCredentials): string {
		return trimTrailingSlash(optionalConfig(credentials, 'base_url') ?? DEFAULT_BASE_URL);
	}

	validateCredentials(credentials: LlmCredentials): void {
		requireSecret(credentials, 'api_key', 'OpenRouter API key');
	}

	async testConnection(credentials: LlmCredentials): Promise<TestConnectionResult> {
		const start = this.now();
		try {
			const models = await this.listModels(credentials);
			return { ok: true, models, latencyMs: Math.round(this.now() - start) };
		} catch (err) {
			return toFailure(err);
		}
	}

	async listModels(credentials: LlmCredentials): Promise<ModelInfo[]> {
		const apiKey = requireSecret(credentials, 'api_key', 'OpenRouter API key');
		let res;
		try {
			res = await withTimeout(TIMEOUT_MS, (signal) =>
				this.http.fetch(`${this.baseUrl(credentials)}/models`, { method: 'GET', headers: bearerHeaders(apiKey), signal })
			);
		} catch {
			throw new LlmUnavailableError('Could not reach OpenRouter.');
		}
		if (!res.ok) throw mapHttpError(res.status, await res.text().catch(() => ''));
		const body = (await res.json()) as OpenRouterModelsResponse;
		return (body.data ?? [])
			.filter((model): model is { id: string; name?: string; context_length?: number } => typeof model.id === 'string')
			.map((model) => ({
				id: model.id,
				label: model.name ?? model.id,
				contextTokens: model.context_length ?? FALLBACK_CONTEXT,
			}));
	}

	resolveRocketRideNode({ model, credentials }: ResolveNodeInput): ResolvedRocketRideNode {
		return {
			component: 'llm_openai_api',
			model,
			modelTotalTokens: rocketrideTokenBudget(contextTokensFor(OPENROUTER_SEED_MODELS, model, FALLBACK_CONTEXT)),
			apikey: requireSecret(credentials, 'api_key', 'OpenRouter API key'),
			baseUrl: this.baseUrl(credentials),
		};
	}
}

export function createOpenRouterProvider(deps?: LlmProviderDeps): OpenRouterProvider {
	return new OpenRouterProvider(deps);
}
