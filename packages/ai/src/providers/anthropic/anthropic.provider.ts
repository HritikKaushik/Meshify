import type { LlmProvider } from '../../provider-core/interfaces/llm-provider.js';
import type { LlmProviderManifest } from '../../provider-core/interfaces/llm-manifest.js';
import { AI_MANIFEST_VERSION } from '../../provider-core/interfaces/llm-manifest.js';
import type { ModelInfo } from '../../provider-core/interfaces/model.js';
import type { LlmCredentials, ResolveNodeInput, TestConnectionResult } from '../../provider-core/interfaces/llm-capability.js';
import type { ResolvedRocketRideNode } from '../../provider-core/interfaces/rocketride-node.js';
import type { LlmHttpClient } from '../../provider-core/interfaces/transport.js';
import { contextTokensFor, rocketrideTokenBudget } from '../shared/http.js';
import { listOpenAiCompatibleModels, testOpenAiCompatible } from '../shared/openai-compatible.js';
import { requireSecret, resolveDeps, type LlmProviderDeps } from '../shared/deps.js';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const FALLBACK_CONTEXT = 200_000;

// Catalog labels/ids are sensible defaults; `allowCustomModel` lets operators
// pin an exact dated model id (e.g. claude-sonnet-4-20250514) as vendors evolve.
export const ANTHROPIC_MODELS: ModelInfo[] = [
	{ id: 'claude-sonnet-4', label: 'Claude Sonnet 4', contextTokens: 200_000, recommended: true },
	{ id: 'claude-opus-4', label: 'Claude Opus 4', contextTokens: 200_000 },
	{ id: 'claude-3-5-haiku-latest', label: 'Claude Haiku', contextTokens: 200_000 },
];

export const ANTHROPIC_MANIFEST: LlmProviderManifest = {
	id: 'anthropic',
	manifestVersion: AI_MANIFEST_VERSION,
	providerVersion: '1.0.0',
	displayName: 'Anthropic',
	summary: 'Claude Opus, Sonnet, and Haiku models with long context windows.',
	iconKey: 'anthropic',
	brandColor: '#D97757',
	docsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
	auth: 'api_key',
	credentialFields: [{ key: 'api_key', label: 'API key', secret: true, placeholder: 'sk-ant-...' }],
	modelSource: 'static',
	allowCustomModel: true,
};

function anthropicHeaders(apiKey: string): Record<string, string> {
	return { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' };
}

export class AnthropicProvider implements LlmProvider {
	readonly manifest = ANTHROPIC_MANIFEST;
	private readonly http: LlmHttpClient;
	private readonly now: () => number;

	constructor(deps?: LlmProviderDeps) {
		const resolved = resolveDeps(deps);
		this.http = resolved.http;
		this.now = resolved.now;
	}

	defaultModels(): ModelInfo[] {
		return ANTHROPIC_MODELS;
	}

	validateCredentials(credentials: LlmCredentials): void {
		requireSecret(credentials, 'api_key', 'Anthropic API key');
	}

	async testConnection(credentials: LlmCredentials): Promise<TestConnectionResult> {
		const apiKey = requireSecret(credentials, 'api_key', 'Anthropic API key');
		return testOpenAiCompatible(
			this.http,
			{ baseUrl: ANTHROPIC_BASE_URL, headers: anthropicHeaders(apiKey) },
			ANTHROPIC_MODELS,
			FALLBACK_CONTEXT,
			this.now
		);
	}

	async listModels(credentials: LlmCredentials): Promise<ModelInfo[]> {
		const apiKey = requireSecret(credentials, 'api_key', 'Anthropic API key');
		return listOpenAiCompatibleModels(
			this.http,
			{ baseUrl: ANTHROPIC_BASE_URL, headers: anthropicHeaders(apiKey) },
			ANTHROPIC_MODELS,
			FALLBACK_CONTEXT
		);
	}

	resolveRocketRideNode({ model, credentials }: ResolveNodeInput): ResolvedRocketRideNode {
		return {
			component: 'llm_anthropic',
			model,
			modelTotalTokens: rocketrideTokenBudget(contextTokensFor(ANTHROPIC_MODELS, model, FALLBACK_CONTEXT)),
			apikey: requireSecret(credentials, 'api_key', 'Anthropic API key'),
		};
	}
}

export function createAnthropicProvider(deps?: LlmProviderDeps): AnthropicProvider {
	return new AnthropicProvider(deps);
}
