/**
 * Static, UI-facing identity of a provider. Descriptors are pure data: the
 * marketplace catalog, capability-driven affordances, and `GET /v1/providers`
 * are all rendered from them without touching provider implementations.
 */
export type ProviderCategory = 'code' | 'chat' | 'docs' | 'tickets' | 'storage' | 'crm';

export type ProviderAvailability = 'available' | 'coming_soon';

/**
 * What a provider can do. The UI and the platform adapt to these flags —
 * a capability that is true MUST be backed by the matching interface
 * (enforced by the provider contract tests), and vice versa.
 */
export interface ProviderCapabilities {
	/** Org-level connect via OAuth/app-install redirect. */
	oauth: boolean;
	/** Inbound webhooks (signature verification + event normalization). */
	webhooks: boolean;
	fullSync: boolean;
	incrementalSync: boolean;
	/** Near-realtime updates (webhook/event driven, not polling). */
	realtimeEvents: boolean;
	manualSync: boolean;
	scheduledSync: boolean;
	/** Post-connect resource selection (repo picker, channel picker, site picker). */
	resourcePicker: boolean;
	healthCheck: boolean;
	/** Enterprise bring-your-own-app configuration. */
	byoa: boolean;
	/** Source-level permission/visibility awareness. */
	permissions: boolean;
}

export interface ProviderDescriptor {
	/** Stable machine id ('github', 'slack', 'sharepoint', …) — the only place the string is defined. */
	id: string;
	displayName: string;
	category: ProviderCategory;
	availability: ProviderAvailability;
	capabilities: ProviderCapabilities;
	/** Frontend icon key (the web app maps ids to bundled icons; unknown keys fall back to a generic mark). */
	iconKey: string;
	brandColor?: string;
	docsUrl?: string;
	/** One-line marketplace blurb. */
	summary: string;
}

export const NO_CAPABILITIES: ProviderCapabilities = {
	oauth: false,
	webhooks: false,
	fullSync: false,
	incrementalSync: false,
	realtimeEvents: false,
	manualSync: false,
	scheduledSync: false,
	resourcePicker: false,
	healthCheck: false,
	byoa: false,
	permissions: false,
};
