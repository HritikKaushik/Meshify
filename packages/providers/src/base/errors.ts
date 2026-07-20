/** Typed provider errors — controllers/processors map these to HTTP/status semantics. */

export class ProviderNotFoundError extends Error {
	constructor(readonly providerId: string) {
		super(`Unknown provider "${providerId}"`);
		this.name = 'ProviderNotFoundError';
	}
}

/** The provider is registered but not operable (missing managed-app config, coming soon). */
export class ProviderNotConfiguredError extends Error {
	constructor(readonly providerId: string, detail?: string) {
		super(detail ?? `Provider "${providerId}" is not configured on this deployment`);
		this.name = 'ProviderNotConfiguredError';
	}
}

/** Authentication/authorization failed at the provider (bad grant, revoked token, unverifiable callback). */
export class ProviderAuthError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProviderAuthError';
	}
}

export class ProviderRateLimitError extends Error {
	constructor(message: string, readonly retryAfterSeconds?: number) {
		super(message);
		this.name = 'ProviderRateLimitError';
	}
}

/** Invalid provider configuration supplied by a user (BYOA form, bad resource id). */
export class ProviderConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProviderConfigError';
	}
}
