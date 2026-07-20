import type { LlmProvider } from '../../provider-core/interfaces/llm-provider.js';
import type { LlmProviderManifest } from '../../provider-core/interfaces/llm-manifest.js';
import { AI_MANIFEST_VERSION } from '../../provider-core/interfaces/llm-manifest.js';
import type { ModelInfo } from '../../provider-core/interfaces/model.js';
import type { LlmCredentials, ResolveNodeInput, TestConnectionResult } from '../../provider-core/interfaces/llm-capability.js';
import type { ResolvedRocketRideNode } from '../../provider-core/interfaces/rocketride-node.js';
import type { LlmHttpClient } from '../../provider-core/interfaces/transport.js';
import { withTimeout } from '../../provider-core/interfaces/transport.js';
import { LlmUnavailableError } from '../../provider-core/interfaces/errors.js';
import { mapHttpError, rocketrideTokenBudget } from '../shared/http.js';
import { toFailure } from '../shared/openai-compatible.js';
import { optionalConfig, resolveDeps, trimTrailingSlash, type LlmProviderDeps } from '../shared/deps.js';

const DEFAULT_SERVER_URL = 'http://localhost:11434';
const DEFAULT_CONTEXT = 8_192;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_REASONING_EFFORT = 'medium';
const TIMEOUT_MS = 8_000;

export const OLLAMA_MANIFEST: LlmProviderManifest = {
	id: 'ollama',
	manifestVersion: AI_MANIFEST_VERSION,
	providerVersion: '1.0.0',
	displayName: 'Ollama',
	summary: 'Run open models locally or on a private server. No API key needed.',
	iconKey: 'ollama',
	brandColor: '#000000',
	docsUrl: 'https://ollama.com/',
	auth: 'none',
	credentialFields: [
		{ key: 'server_url', label: 'Server URL', secret: false, placeholder: DEFAULT_SERVER_URL, hint: 'Where the Ollama server is reachable from RocketRide.' },
	],
	modelSource: 'dynamic',
	allowCustomModel: true,
};

export class OllamaProvider implements LlmProvider {
	readonly manifest = OLLAMA_MANIFEST;
	private readonly http: LlmHttpClient;
	private readonly now: () => number;

	constructor(deps?: LlmProviderDeps) {
		const resolved = resolveDeps(deps);
		this.http = resolved.http;
		this.now = resolved.now;
	}

	defaultModels(): ModelInfo[] {
		return [];
	}

	private serverUrl(credentials: LlmCredentials): string {
		return trimTrailingSlash(optionalConfig(credentials, 'server_url') ?? DEFAULT_SERVER_URL);
	}

	validateCredentials(_credentials: LlmCredentials): void {
		// Keyless — the server URL has a sensible default, so nothing is required.
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
		let res;
		try {
			res = await withTimeout(TIMEOUT_MS, (signal) =>
				this.http.fetch(`${this.serverUrl(credentials)}/api/tags`, { method: 'GET', signal })
			);
		} catch {
			throw new LlmUnavailableError('Could not reach the Ollama server.');
		}
		if (!res.ok) throw mapHttpError(res.status, await res.text().catch(() => ''));
		const body = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
		return (body.models ?? [])
			.map((entry) => entry.name ?? entry.model)
			.filter((name): name is string => typeof name === 'string')
			.map((name) => ({ id: name, label: name, contextTokens: DEFAULT_CONTEXT }));
	}

	resolveRocketRideNode({ model, credentials }: ResolveNodeInput): ResolvedRocketRideNode {
		return {
			component: 'llm_ollama',
			model,
			modelTotalTokens: rocketrideTokenBudget(DEFAULT_CONTEXT),
			baseUrl: `${this.serverUrl(credentials)}/v1`,
			extra: { temperature: DEFAULT_TEMPERATURE, reasoning_effort: DEFAULT_REASONING_EFFORT },
		};
	}
}

export function createOllamaProvider(deps?: LlmProviderDeps): OllamaProvider {
	return new OllamaProvider(deps);
}
