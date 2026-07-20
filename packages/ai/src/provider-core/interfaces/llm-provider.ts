import type { LlmCapable } from './llm-capability.js';
import type { LlmProviderManifest } from './llm-manifest.js';
import type { ModelInfo } from './model.js';

/**
 * A first-class AI provider. Plain object implementing the capability contract
 * plus a self-describing manifest — there is no abstract base class, mirroring
 * the `@meshify/providers` convention. Concrete providers are created by
 * `createXProvider(deps)` factories so the HTTP transport is injectable/fakeable.
 */
export interface LlmProvider extends LlmCapable {
	readonly manifest: LlmProviderManifest;
	/**
	 * The shipped static model catalog (empty when `manifest.modelSource` is
	 * 'dynamic'). Used to populate the picker before credentials exist and to
	 * look up a model's context window for `resolveRocketRideNode`.
	 */
	defaultModels(): ModelInfo[];
}
