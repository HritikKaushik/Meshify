import type { ProviderDescriptor } from './descriptor.js';
import type { OAuthCapable } from './oauth.js';
import type { WebhookCapable } from './webhook.js';
import type { SyncCapable } from './sync.js';
import type { HealthCapable } from './health.js';
import type { ResourceBrowsingCapable } from './resources.js';
import type { CitationCapable } from './citation.js';
import type { ByoaCapable } from './byoa.js';

/**
 * The minimal contract every provider satisfies: a descriptor. Everything else
 * is an optional capability interface, advertised by descriptor flags and
 * discovered through the type guards below — never through `if (id === 'github')`.
 *
 * A descriptor flag and its interface MUST agree (a provider declaring
 * `webhooks: true` implements WebhookCapable); the provider contract tests
 * enforce this in both directions.
 */
export interface Provider {
	readonly descriptor: ProviderDescriptor;
}

function hasMethods(candidate: object, methods: string[]): boolean {
	return methods.every((m) => typeof (candidate as Record<string, unknown>)[m] === 'function');
}

export function supportsOAuth(p: Provider): p is Provider & OAuthCapable {
	return p.descriptor.capabilities.oauth && hasMethods(p, ['buildConnectUrl', 'completeConnect']);
}

export function supportsWebhooks(p: Provider): p is Provider & WebhookCapable {
	return p.descriptor.capabilities.webhooks && hasMethods(p, ['verifyWebhook', 'describeWebhook', 'normalizeWebhook']);
}

export function supportsSync(p: Provider): p is Provider & SyncCapable {
	return (p.descriptor.capabilities.fullSync || p.descriptor.capabilities.incrementalSync) && hasMethods(p, ['executeSync']);
}

export function supportsHealthCheck(p: Provider): p is Provider & HealthCapable {
	return p.descriptor.capabilities.healthCheck && hasMethods(p, ['checkHealth']);
}

export function supportsResourceBrowsing(p: Provider): p is Provider & ResourceBrowsingCapable {
	return p.descriptor.capabilities.resourcePicker && hasMethods(p, ['listResources']);
}

export function supportsCitations(p: Provider): p is Provider & CitationCapable {
	return hasMethods(p, ['ownsSourceRef', 'enrichCitation']);
}

export function supportsByoa(p: Provider): p is Provider & ByoaCapable {
	return p.descriptor.capabilities.byoa && hasMethods(p, ['describeByoaConfig', 'validateByoaConfig']);
}
