/**
 * The Provider Manifest: static, machine-readable identity + contract of a
 * provider. Pure data — the marketplace catalog, capability-driven UI,
 * `GET /v1/providers`, docs, and future remote-provider loading are all
 * rendered from manifests without touching implementations.
 */
export type ProviderCategory = 'code' | 'chat' | 'docs' | 'tickets' | 'storage' | 'crm';

export type ProviderAvailability = 'available' | 'coming_soon';

export type ProviderAuthType = 'oauth2' | 'app_install' | 'api_key' | 'none';

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
	/** Exposes executable Tools (the MCP-compatible surface) alongside knowledge sources. */
	tools: boolean;
}

/**
 * The platform contract version this manifest speaks. Bumped when the
 * capability interfaces change incompatibly; the registry accepts a supported
 * range so providers upgrade independently of the platform.
 */
export const CURRENT_MANIFEST_VERSION = 1;
export const SUPPORTED_MANIFEST_VERSIONS: readonly number[] = [1];

export interface ProviderManifest {
	/** Stable machine id ('github', 'slack', 'sharepoint', …) — the only place the string is defined. */
	id: string;
	/** Platform contract version (see CURRENT_MANIFEST_VERSION). */
	manifestVersion: number;
	/** Semver of the provider implementation itself — providers are independently upgradeable. */
	providerVersion: string;
	displayName: string;
	category: ProviderCategory;
	availability: ProviderAvailability;
	capabilities: ProviderCapabilities;
	/** How the provider authenticates orgs, machine-readable (drives connect UX + docs). */
	auth: { type: ProviderAuthType; scopes?: string[] };
	/** Provider-side webhook event types this provider consumes (subscription config + docs). */
	webhookEvents?: string[];
	/** Names of the Tools the provider exposes (full definitions via ToolCapable.listTools). */
	toolNames?: string[];
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
	tools: false,
};

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/;

/** Structural manifest validation — the registry refuses to register anything that fails. */
export function validateManifest(manifest: ProviderManifest): string[] {
	const problems: string[] = [];
	if (!/^[a-z][a-z0-9-]*$/.test(manifest.id)) problems.push(`id "${manifest.id}" must be kebab-case`);
	if (!SUPPORTED_MANIFEST_VERSIONS.includes(manifest.manifestVersion)) {
		problems.push(`manifestVersion ${manifest.manifestVersion} is not supported (supported: ${SUPPORTED_MANIFEST_VERSIONS.join(', ')})`);
	}
	if (!SEMVER_PATTERN.test(manifest.providerVersion)) problems.push(`providerVersion "${manifest.providerVersion}" is not semver`);
	if (!manifest.displayName) problems.push('displayName is required');
	if (!manifest.summary) problems.push('summary is required');
	if (!manifest.iconKey) problems.push('iconKey is required');
	if (manifest.capabilities.oauth && manifest.auth.type === 'none') problems.push('oauth capability requires an auth type');
	if (manifest.capabilities.tools && !(manifest.toolNames?.length)) problems.push('tools capability requires toolNames');
	return problems;
}
