/**
 * Masked-input metadata the frontend renders for a provider's connect / rotate
 * form. Mirrors the knowledge-source `ByoaConfigField` shape so the UI dialog
 * stays provider-agnostic: the component holds zero vendor knowledge and simply
 * renders whatever fields the manifest declares.
 *
 * `secret` fields are write-only — never echoed back to the browser — and are
 * stored in the Credentials Vault. Non-secret fields (e.g. Azure endpoint,
 * Ollama server URL) live in the configuration row's `config` map.
 */
export interface CredentialField {
	key: string;
	label: string;
	secret: boolean;
	placeholder?: string;
	multiline?: boolean;
	/** Optional fields may be left blank (e.g. OpenRouter custom base URL). */
	optional?: boolean;
	/** Short helper text shown under the input. */
	hint?: string;
}
