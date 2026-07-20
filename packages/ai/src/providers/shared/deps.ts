import type { LlmHttpClient } from '../../provider-core/interfaces/transport.js';
import { defaultLlmHttpClient } from '../../provider-core/interfaces/transport.js';
import type { LlmCredentials } from '../../provider-core/interfaces/llm-capability.js';
import { LlmConfigError } from '../../provider-core/interfaces/errors.js';

/** Injectable dependencies every adapter factory accepts — fakeable in tests. */
export interface LlmProviderDeps {
	http?: LlmHttpClient;
	now?: () => number;
}

export function resolveDeps(deps?: LlmProviderDeps): { http: LlmHttpClient; now: () => number } {
	return {
		http: deps?.http ?? defaultLlmHttpClient,
		now: deps?.now ?? (() => Date.now()),
	};
}

/** Reads a required secret credential, throwing a typed config error when absent. */
export function requireSecret(credentials: LlmCredentials, key: string, label: string): string {
	const value = credentials.secrets[key]?.trim();
	if (!value) throw new LlmConfigError(`${label} is required.`);
	return value;
}

/** Reads a required non-secret config value, throwing a typed config error when absent. */
export function requireConfig(credentials: LlmCredentials, key: string, label: string): string {
	const value = credentials.config[key]?.trim();
	if (!value) throw new LlmConfigError(`${label} is required.`);
	return value;
}

/** Reads an optional non-secret config value. */
export function optionalConfig(credentials: LlmCredentials, key: string): string | undefined {
	const value = credentials.config[key]?.trim();
	return value ? value : undefined;
}

export function bearerHeaders(apiKey: string): Record<string, string> {
	return { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
}

/** Strips a trailing slash so base URLs compose predictably. */
export function trimTrailingSlash(url: string): string {
	return url.replace(/\/+$/, '');
}
