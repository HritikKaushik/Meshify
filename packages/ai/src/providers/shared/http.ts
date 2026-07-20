import {
	LlmAuthError,
	LlmProviderError,
	LlmQuotaError,
	LlmRateLimitError,
	LlmUnavailableError,
	LlmUnsupportedModelError,
} from '../../provider-core/interfaces/errors.js';
import type { ModelInfo } from '../../provider-core/interfaces/model.js';

/**
 * Maps an HTTP status + response body into a typed `LlmProviderError`. Shared by
 * every adapter so error handling is uniform: 401/403 → auth, 429 → quota vs
 * rate-limit (disambiguated by body), 404 → unsupported model, 5xx → unavailable.
 */
export function mapHttpError(status: number, bodyText: string): LlmProviderError {
	const snippet = bodyText.slice(0, 300);
	if (status === 401 || status === 403) {
		return new LlmAuthError('The provider rejected these credentials.', snippet);
	}
	if (status === 429) {
		if (/quota|billing|insufficient|credit|payment/i.test(bodyText)) {
			return new LlmQuotaError('The provider account is out of quota or credits.', snippet);
		}
		return new LlmRateLimitError('The provider is rate limiting requests. Try again shortly.', snippet);
	}
	if (status === 404) {
		return new LlmUnsupportedModelError('The endpoint or model was not found for this account.', snippet);
	}
	if (status >= 500) {
		return new LlmUnavailableError(`The provider returned an error (HTTP ${status}).`, snippet);
	}
	return new LlmProviderError('unknown', `The provider returned HTTP ${status}.`, snippet);
}

/** Look up a model's context window from a catalog, falling back to `fallback`. */
export function contextTokensFor(models: ModelInfo[], modelId: string, fallback: number): number {
	return models.find((model) => model.id === modelId)?.contextTokens ?? fallback;
}

/**
 * RocketRide's `modelTotalTokens` is a bounded generation budget, NOT the full
 * context window — RocketRide's own docs use 16384 even for a 128k-context model
 * (see .rocketride/docs/ROCKETRIDE_PIPELINE_RULES.md). Passing a real
 * (e.g. million-token) context window makes RocketRide request an invalid
 * completion size from the vendor, which surfaces as a generic
 * "An error occurred with the OpenAI API" ValueError at chat time. Clamp the
 * value we send into the RocketRide node to this safe budget; `ModelInfo.contextTokens`
 * stays the true window for display.
 */
export const ROCKETRIDE_TOKEN_BUDGET = 16384;

export function rocketrideTokenBudget(contextTokens: number): number {
	return Math.max(1, Math.min(contextTokens, ROCKETRIDE_TOKEN_BUDGET));
}
