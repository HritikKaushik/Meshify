import type { LlmHttpClient } from '../../provider-core/interfaces/transport.js';
import { withTimeout } from '../../provider-core/interfaces/transport.js';
import type { ModelInfo } from '../../provider-core/interfaces/model.js';
import type { TestConnectionResult } from '../../provider-core/interfaces/llm-capability.js';
import { LlmProviderError, LlmUnavailableError, LlmTimeoutError } from '../../provider-core/interfaces/errors.js';
import { mapHttpError } from './http.js';

const DEFAULT_TIMEOUT_MS = 12_000;

interface OpenAiCompatibleTarget {
	/** Base URL WITHOUT a trailing slash, e.g. "https://api.openai.com/v1". */
	baseUrl: string;
	/** Auth headers (Bearer for OpenAI/OpenRouter, `api-key` for Azure). */
	headers: Record<string, string>;
	/** Extra query string appended to the models URL (e.g. Azure `?api-version=`). */
	modelsQuery?: string;
	/** Region label to surface in the test result, if known. */
	region?: string;
}

/**
 * Lists models from any OpenAI-compatible `GET /models` endpoint. `catalog`
 * supplies known context windows / labels; unknown ids fall back to
 * `fallbackContextTokens`.
 */
export async function listOpenAiCompatibleModels(
	http: LlmHttpClient,
	target: OpenAiCompatibleTarget,
	catalog: ModelInfo[],
	fallbackContextTokens: number
): Promise<ModelInfo[]> {
	const url = `${target.baseUrl}/models${target.modelsQuery ?? ''}`;
	let res;
	try {
		res = await withTimeout(DEFAULT_TIMEOUT_MS, (signal) =>
			http.fetch(url, { method: 'GET', headers: target.headers, signal })
		);
	} catch {
		throw new LlmUnavailableError('Could not reach the provider.');
	}
	if (!res.ok) {
		throw mapHttpError(res.status, await safeText(res));
	}
	const body = (await res.json()) as { data?: Array<{ id?: string }> };
	const ids = (body.data ?? []).map((entry) => entry.id).filter((id): id is string => typeof id === 'string');
	return ids.map((id) => {
		const known = catalog.find((model) => model.id === id);
		return known ?? { id, label: id, contextTokens: fallbackContextTokens };
	});
}

/**
 * Live connection test for OpenAI-compatible providers: authenticates against
 * `GET /models`, measures latency, and returns discovered models. Never throws.
 */
export async function testOpenAiCompatible(
	http: LlmHttpClient,
	target: OpenAiCompatibleTarget,
	catalog: ModelInfo[],
	fallbackContextTokens: number,
	now: () => number
): Promise<TestConnectionResult> {
	const start = now();
	try {
		const models = await listOpenAiCompatibleModels(http, target, catalog, fallbackContextTokens);
		return { ok: true, models, latencyMs: Math.round(now() - start), region: target.region };
	} catch (err) {
		return toFailure(err);
	}
}

export function toFailure(err: unknown): TestConnectionResult {
	if (err instanceof LlmTimeoutError) return { ok: false, error: err.message, errorCode: err.code };
	if (err instanceof LlmProviderError) return { ok: false, error: err.message, errorCode: err.code };
	return { ok: false, error: err instanceof Error ? err.message : 'Unknown error', errorCode: 'unknown' };
}

async function safeText(res: { text(): Promise<string> }): Promise<string> {
	try {
		return await res.text();
	} catch {
		return '';
	}
}
