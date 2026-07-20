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
import { requireSecret, resolveDeps, type LlmProviderDeps } from '../shared/deps.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const FALLBACK_CONTEXT = 1_048_576;
const DEFAULT_OUTPUT_TOKENS = 8_192;
const TIMEOUT_MS = 12_000;

export const GEMINI_MODELS: ModelInfo[] = [
	{ id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextTokens: 1_048_576, recommended: true },
	{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextTokens: 1_048_576 },
];

export const GEMINI_MANIFEST: LlmProviderManifest = {
	id: 'gemini',
	manifestVersion: AI_MANIFEST_VERSION,
	providerVersion: '1.0.0',
	displayName: 'Google Gemini',
	summary: 'Gemini 2.5 Pro and Flash with million-token context.',
	iconKey: 'gemini',
	brandColor: '#1A73E8',
	docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
	auth: 'api_key',
	credentialFields: [{ key: 'api_key', label: 'API key', secret: true, placeholder: 'AIza...' }],
	modelSource: 'static',
	allowCustomModel: true,
};

interface GeminiModelsResponse {
	models?: Array<{ name?: string; inputTokenLimit?: number; supportedGenerationMethods?: string[] }>;
}

export class GeminiProvider implements LlmProvider {
	readonly manifest = GEMINI_MANIFEST;
	private readonly http: LlmHttpClient;
	private readonly now: () => number;

	constructor(deps?: LlmProviderDeps) {
		const resolved = resolveDeps(deps);
		this.http = resolved.http;
		this.now = resolved.now;
	}

	defaultModels(): ModelInfo[] {
		return GEMINI_MODELS;
	}

	validateCredentials(credentials: LlmCredentials): void {
		requireSecret(credentials, 'api_key', 'Gemini API key');
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
		// Google accepts the key via header (`x-goog-api-key`) so it never lands in a URL/query string.
		const apiKey = requireSecret(credentials, 'api_key', 'Gemini API key');
		let res;
		try {
			res = await withTimeout(TIMEOUT_MS, (signal) =>
				this.http.fetch(`${GEMINI_BASE_URL}/models`, {
					method: 'GET',
					headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
					signal,
				})
			);
		} catch {
			throw new LlmUnavailableError('Could not reach Google Gemini.');
		}
		if (!res.ok) throw mapHttpError(res.status, await res.text().catch(() => ''));
		const body = (await res.json()) as GeminiModelsResponse;
		return (body.models ?? [])
			.filter((model) => (model.supportedGenerationMethods ?? []).includes('generateContent'))
			.map((model) => {
				const id = (model.name ?? '').replace(/^models\//, '');
				const known = GEMINI_MODELS.find((entry) => entry.id === id);
				return known ?? { id, label: id, contextTokens: model.inputTokenLimit ?? FALLBACK_CONTEXT };
			})
			.filter((model) => model.id.length > 0);
	}

	resolveRocketRideNode({ model, credentials }: ResolveNodeInput): ResolvedRocketRideNode {
		return {
			component: 'llm_gemini',
			model,
			modelTotalTokens: rocketrideTokenBudget(contextTokensFor(GEMINI_MODELS, model, FALLBACK_CONTEXT)),
			apikey: requireSecret(credentials, 'api_key', 'Gemini API key'),
			extra: { outputTokens: DEFAULT_OUTPUT_TOKENS },
		};
	}
}

export function createGeminiProvider(deps?: LlmProviderDeps): GeminiProvider {
	return new GeminiProvider(deps);
}
