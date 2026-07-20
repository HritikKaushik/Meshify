/** A model a provider can run, as shown in the default-model picker. */
export interface ModelInfo {
	/** The exact model id sent to the provider / RocketRide, e.g. "gpt-4.1", "claude-sonnet-4". */
	id: string;
	/** Human label for the picker, e.g. "GPT-4.1". */
	label: string;
	/**
	 * Total context window in tokens. Fed to RocketRide's `modelTotalTokens`
	 * custom-profile field. A conservative catalog value is fine — it bounds
	 * prompt assembly, it is not a hard billing figure.
	 */
	contextTokens: number;
	/** Marks the recommended default for the provider. */
	recommended?: boolean;
}
