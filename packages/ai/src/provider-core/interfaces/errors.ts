/**
 * Typed errors every LLM adapter maps vendor failures into. The platform-api
 * controller translates these to actionable HTTP responses (see the
 * `llm-provider-support.ts` error mapper), so no vendor-specific error shape
 * ever leaks past the adapter boundary.
 */
export type LlmErrorCode =
	| 'invalid_credentials'
	| 'rate_limited'
	| 'quota_exceeded'
	| 'provider_unavailable'
	| 'unsupported_model'
	| 'timeout'
	| 'config'
	| 'not_found'
	| 'unknown';

export class LlmProviderError extends Error {
	constructor(
		readonly code: LlmErrorCode,
		message: string,
		readonly detail?: unknown
	) {
		super(message);
		this.name = 'LlmProviderError';
	}
}

/** Credentials were rejected by the provider (401/403 or malformed key). */
export class LlmAuthError extends LlmProviderError {
	constructor(message = 'The provider rejected these credentials.', detail?: unknown) {
		super('invalid_credentials', message, detail);
		this.name = 'LlmAuthError';
	}
}

/** Provider is rate limiting (429 with retryable semantics). */
export class LlmRateLimitError extends LlmProviderError {
	constructor(message = 'The provider is rate limiting requests. Try again shortly.', detail?: unknown) {
		super('rate_limited', message, detail);
		this.name = 'LlmRateLimitError';
	}
}

/** Account is out of quota/credits (429/402 with billing semantics). */
export class LlmQuotaError extends LlmProviderError {
	constructor(message = 'The provider account has exceeded its quota.', detail?: unknown) {
		super('quota_exceeded', message, detail);
		this.name = 'LlmQuotaError';
	}
}

/** Provider endpoint is unreachable or returned 5xx. */
export class LlmUnavailableError extends LlmProviderError {
	constructor(message = 'The provider is currently unavailable.', detail?: unknown) {
		super('provider_unavailable', message, detail);
		this.name = 'LlmUnavailableError';
	}
}

/** The requested model does not exist / is not accessible with these credentials. */
export class LlmUnsupportedModelError extends LlmProviderError {
	constructor(message = 'The selected model is not available for this account.', detail?: unknown) {
		super('unsupported_model', message, detail);
		this.name = 'LlmUnsupportedModelError';
	}
}

/** The request timed out. */
export class LlmTimeoutError extends LlmProviderError {
	constructor(message = 'The provider did not respond in time.', detail?: unknown) {
		super('timeout', message, detail);
		this.name = 'LlmTimeoutError';
	}
}

/** Required non-secret configuration is missing or malformed (e.g. Azure endpoint). */
export class LlmConfigError extends LlmProviderError {
	constructor(message: string, detail?: unknown) {
		super('config', message, detail);
		this.name = 'LlmConfigError';
	}
}

/** No provider is registered for the given id. */
export class LlmProviderNotFoundError extends LlmProviderError {
	constructor(id: string) {
		super('not_found', `No LLM provider registered for "${id}".`);
		this.name = 'LlmProviderNotFoundError';
	}
}
