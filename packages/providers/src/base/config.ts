/** Coerce a registration-config value to a string ('' for null/undefined) — the config-read convention shared by providers. */
export function readString(config: Record<string, unknown>, key: string): string {
	const value = config[key];
	return typeof value === 'string' ? value : value == null ? '' : String(value);
}
