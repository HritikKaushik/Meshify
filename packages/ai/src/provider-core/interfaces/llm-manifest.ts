import type { CredentialField } from './credential-field.js';

export type LlmAuthType = 'api_key' | 'none';

/** Whether the model list is a shipped catalog or fetched live from the provider. */
export type LlmModelSource = 'static' | 'dynamic';

export const AI_MANIFEST_VERSION = 1;

/**
 * Self-describing metadata for an LLM provider. The AI provider registry
 * validates this at registration and the marketplace/detail UI renders entirely
 * from it — adding a provider means shipping a manifest + adapter, no UI edits.
 *
 * This is deliberately a **separate** type from the knowledge-source
 * `ProviderManifest` in `@meshify/providers`: LLM providers answer "which model
 * runs inference", not "where does knowledge come from", and share no lifecycle
 * (no OAuth, webhooks, sync, or project attachment).
 */
export interface LlmProviderManifest {
	/** kebab-case id, the only place the vendor string is hardcoded, e.g. "azure-openai". */
	id: string;
	manifestVersion: number;
	/** Semver of the adapter implementation. */
	providerVersion: string;
	displayName: string;
	summary: string;
	iconKey: string;
	brandColor?: string;
	docsUrl?: string;
	auth: LlmAuthType;
	/** Masked-input metadata for the connect / rotate form. */
	credentialFields: CredentialField[];
	modelSource: LlmModelSource;
	/** Allow a free-form model id in addition to (or instead of) the catalog. */
	allowCustomModel: boolean;
}

export function validateLlmManifest(manifest: LlmProviderManifest): string[] {
	const problems: string[] = [];
	if (!/^[a-z0-9-]+$/.test(manifest.id)) problems.push('id must be kebab-case');
	if (manifest.manifestVersion !== AI_MANIFEST_VERSION) {
		problems.push(`manifestVersion must be ${AI_MANIFEST_VERSION}`);
	}
	if (!/^\d+\.\d+\.\d+$/.test(manifest.providerVersion)) problems.push('providerVersion must be semver');
	if (!manifest.displayName) problems.push('displayName is required');
	if (!manifest.summary) problems.push('summary is required');
	if (!manifest.iconKey) problems.push('iconKey is required');
	if (manifest.auth === 'api_key' && !manifest.credentialFields.some((field) => field.secret)) {
		problems.push('api_key auth requires at least one secret credential field');
	}
	const keys = new Set<string>();
	for (const field of manifest.credentialFields) {
		if (keys.has(field.key)) problems.push(`duplicate credential field key "${field.key}"`);
		keys.add(field.key);
	}
	return problems;
}
