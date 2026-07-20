import type { LlmProvider } from '../../provider-core/interfaces/llm-provider.js';
import type { LlmProviderManifest } from '../../provider-core/interfaces/llm-manifest.js';
import { AI_MANIFEST_VERSION } from '../../provider-core/interfaces/llm-manifest.js';
import type { ModelInfo } from '../../provider-core/interfaces/model.js';
import type { LlmCredentials, ResolveNodeInput, TestConnectionResult } from '../../provider-core/interfaces/llm-capability.js';
import type { ResolvedRocketRideNode } from '../../provider-core/interfaces/rocketride-node.js';
import type { LlmHttpClient } from '../../provider-core/interfaces/transport.js';
import { withTimeout } from '../../provider-core/interfaces/transport.js';
import { LlmConfigError, LlmUnavailableError } from '../../provider-core/interfaces/errors.js';
import { mapHttpError, rocketrideTokenBudget } from '../shared/http.js';
import { toFailure } from '../shared/openai-compatible.js';
import { requireConfig, requireSecret, resolveDeps, trimTrailingSlash, type LlmProviderDeps } from '../shared/deps.js';

const DEFAULT_CONTEXT = 128_000;
const TIMEOUT_MS = 12_000;

export const AZURE_OPENAI_MANIFEST: LlmProviderManifest = {
	id: 'azure-openai',
	manifestVersion: AI_MANIFEST_VERSION,
	providerVersion: '1.0.0',
	displayName: 'Azure OpenAI',
	summary: 'OpenAI models served from your Azure resource and deployment.',
	iconKey: 'azure-openai',
	brandColor: '#0078D4',
	docsUrl: 'https://learn.microsoft.com/azure/ai-services/openai/',
	auth: 'api_key',
	credentialFields: [
		{ key: 'endpoint', label: 'Endpoint', secret: false, placeholder: 'https://my-resource.openai.azure.com' },
		{ key: 'api_version', label: 'API version', secret: false, placeholder: '2024-10-21' },
		{ key: 'deployment', label: 'Deployment name', secret: false, placeholder: 'gpt-4o' },
		{ key: 'api_key', label: 'API key', secret: true },
	],
	modelSource: 'dynamic',
	allowCustomModel: true,
};

function azureEndpoint(credentials: LlmCredentials): string {
	const endpoint = trimTrailingSlash(requireConfig(credentials, 'endpoint', 'Azure endpoint'));
	if (!/^https:\/\//i.test(endpoint)) throw new LlmConfigError('Azure endpoint must be an https URL.');
	return endpoint;
}

export class AzureOpenAiProvider implements LlmProvider {
	readonly manifest = AZURE_OPENAI_MANIFEST;
	private readonly http: LlmHttpClient;
	private readonly now: () => number;

	constructor(deps?: LlmProviderDeps) {
		const resolved = resolveDeps(deps);
		this.http = resolved.http;
		this.now = resolved.now;
	}

	defaultModels(): ModelInfo[] {
		// The deployment name is the model; there is no fixed catalog.
		return [];
	}

	validateCredentials(credentials: LlmCredentials): void {
		azureEndpoint(credentials);
		requireConfig(credentials, 'api_version', 'Azure API version');
		requireConfig(credentials, 'deployment', 'Azure deployment name');
		requireSecret(credentials, 'api_key', 'Azure API key');
	}

	async testConnection(credentials: LlmCredentials): Promise<TestConnectionResult> {
		this.validateCredentials(credentials);
		const start = this.now();
		try {
			const models = await this.listModels(credentials);
			return { ok: true, models, latencyMs: Math.round(this.now() - start) };
		} catch (err) {
			return toFailure(err);
		}
	}

	async listModels(credentials: LlmCredentials): Promise<ModelInfo[]> {
		const endpoint = azureEndpoint(credentials);
		const apiVersion = requireConfig(credentials, 'api_version', 'Azure API version');
		const apiKey = requireSecret(credentials, 'api_key', 'Azure API key');
		const deployment = requireConfig(credentials, 'deployment', 'Azure deployment name');
		let res;
		try {
			res = await withTimeout(TIMEOUT_MS, (signal) =>
				this.http.fetch(`${endpoint}/openai/deployments?api-version=${encodeURIComponent(apiVersion)}`, {
					method: 'GET',
					headers: { 'api-key': apiKey, 'content-type': 'application/json' },
					signal,
				})
			);
		} catch {
			throw new LlmUnavailableError('Could not reach the Azure OpenAI endpoint.');
		}
		if (!res.ok) throw mapHttpError(res.status, await res.text().catch(() => ''));
		const body = (await res.json()) as { data?: Array<{ id?: string; model?: string }> };
		const deployments = (body.data ?? [])
			.map((entry) => entry.id)
			.filter((id): id is string => typeof id === 'string')
			.map((id) => ({ id, label: id, contextTokens: DEFAULT_CONTEXT }));
		// Ensure the configured deployment is always selectable even if listing is restricted.
		return deployments.some((model) => model.id === deployment)
			? deployments
			: [{ id: deployment, label: deployment, contextTokens: DEFAULT_CONTEXT }, ...deployments];
	}

	resolveRocketRideNode({ model, credentials }: ResolveNodeInput): ResolvedRocketRideNode {
		const endpoint = azureEndpoint(credentials);
		const deployment = requireConfig(credentials, 'deployment', 'Azure deployment name');
		// Mapped onto RocketRide's generic OpenAI-compatible node. NOTE: Azure also
		// requires an `api-version` query param that the generic node does not add;
		// verify execution against your RocketRide deployment (see docs). Credential
		// validation and testConnection use the correct Azure auth and are exact.
		return {
			component: 'llm_openai_api',
			model: model || deployment,
			modelTotalTokens: rocketrideTokenBudget(DEFAULT_CONTEXT),
			apikey: requireSecret(credentials, 'api_key', 'Azure API key'),
			baseUrl: `${endpoint}/openai/deployments/${deployment}`,
		};
	}
}

export function createAzureOpenAiProvider(deps?: LlmProviderDeps): AzureOpenAiProvider {
	return new AzureOpenAiProvider(deps);
}
