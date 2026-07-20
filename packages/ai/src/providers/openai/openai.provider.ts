import type { LlmProvider } from '../../provider-core/interfaces/llm-provider.js';
import type { LlmProviderManifest } from '../../provider-core/interfaces/llm-manifest.js';
import { AI_MANIFEST_VERSION } from '../../provider-core/interfaces/llm-manifest.js';
import type { ModelInfo } from '../../provider-core/interfaces/model.js';
import type { LlmCredentials, ResolveNodeInput, TestConnectionResult } from '../../provider-core/interfaces/llm-capability.js';
import type { ResolvedRocketRideNode } from '../../provider-core/interfaces/rocketride-node.js';
import type { LlmHttpClient } from '../../provider-core/interfaces/transport.js';
import { contextTokensFor, rocketrideTokenBudget } from '../shared/http.js';
import { listOpenAiCompatibleModels, testOpenAiCompatible } from '../shared/openai-compatible.js';
import { bearerHeaders, requireSecret, resolveDeps, type LlmProviderDeps } from '../shared/deps.js';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const FALLBACK_CONTEXT = 128_000;

export const OPENAI_MODELS: ModelInfo[] = [
	{ id: 'gpt-4.1', label: 'GPT-4.1', contextTokens: 1_047_576, recommended: true },
	{ id: 'gpt-4o', label: 'GPT-4o', contextTokens: 128_000 },
	{ id: 'gpt-4o-mini', label: 'GPT-4o mini', contextTokens: 128_000 },
	{ id: 'o3', label: 'o3', contextTokens: 200_000 },
	{ id: 'o4-mini', label: 'o4-mini', contextTokens: 200_000 },
];

export const OPENAI_MANIFEST: LlmProviderManifest = {
	id: 'openai',
	manifestVersion: AI_MANIFEST_VERSION,
	providerVersion: '1.0.0',
	displayName: 'OpenAI',
	summary: 'GPT-4.1, GPT-4o, and the o-series reasoning models.',
	iconKey: 'openai',
	brandColor: '#412991',
	docsUrl: 'https://platform.openai.com/docs/models',
	auth: 'api_key',
	credentialFields: [{ key: 'api_key', label: 'API key', secret: true, placeholder: 'sk-...' }],
	modelSource: 'static',
	allowCustomModel: true,
};

export class OpenAiProvider implements LlmProvider {
	readonly manifest = OPENAI_MANIFEST;
	private readonly http: LlmHttpClient;
	private readonly now: () => number;

	constructor(deps?: LlmProviderDeps) {
		const resolved = resolveDeps(deps);
		this.http = resolved.http;
		this.now = resolved.now;
	}

	defaultModels(): ModelInfo[] {
		return OPENAI_MODELS;
	}

	validateCredentials(credentials: LlmCredentials): void {
		requireSecret(credentials, 'api_key', 'OpenAI API key');
	}

	async testConnection(credentials: LlmCredentials): Promise<TestConnectionResult> {
		const apiKey = requireSecret(credentials, 'api_key', 'OpenAI API key');
		return testOpenAiCompatible(
			this.http,
			{ baseUrl: OPENAI_BASE_URL, headers: bearerHeaders(apiKey) },
			OPENAI_MODELS,
			FALLBACK_CONTEXT,
			this.now
		);
	}

	async listModels(credentials: LlmCredentials): Promise<ModelInfo[]> {
		const apiKey = requireSecret(credentials, 'api_key', 'OpenAI API key');
		return listOpenAiCompatibleModels(
			this.http,
			{ baseUrl: OPENAI_BASE_URL, headers: bearerHeaders(apiKey) },
			OPENAI_MODELS,
			FALLBACK_CONTEXT
		);
	}

	resolveRocketRideNode({ model, credentials }: ResolveNodeInput): ResolvedRocketRideNode {
		return {
			component: 'llm_openai',
			model,
			modelTotalTokens: rocketrideTokenBudget(contextTokensFor(OPENAI_MODELS, model, FALLBACK_CONTEXT)),
			apikey: requireSecret(credentials, 'api_key', 'OpenAI API key'),
		};
	}
}

export function createOpenAiProvider(deps?: LlmProviderDeps): OpenAiProvider {
	return new OpenAiProvider(deps);
}
