/** One input field of a provider's bring-your-own-app configuration form. */
export interface ByoaConfigField {
	/** Credential kind it is stored under (e.g. 'app_client_secret') or metadata key for non-secrets. */
	key: string;
	label: string;
	/** Secrets are stored encrypted in the vault and never echoed back to the UI. */
	secret: boolean;
	multiline?: boolean;
	placeholder?: string;
}

/**
 * Enterprise "bring your own app": the provider describes what an org must
 * supply and validates a submission. Storage/serving is platform-generic.
 */
export interface ByoaCapable {
	describeByoaConfig(): ByoaConfigField[];
	/** Throws ProviderConfigError with a user-safe message on invalid input. */
	validateByoaConfig(values: Record<string, string>): void;
}
