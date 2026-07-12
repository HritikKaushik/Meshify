/**
 * Provisions/tears down Qdrant collections directly via Qdrant's REST API.
 *
 * RocketRide's `qdrant` component will only WRITE to a collection it recognises
 * as its own: on first write it checks for a "schema" control document
 * (a point with `meta.objectId === "schema"`) and errors ("Collection does not
 * have control document") if absent. So a collection created by a plain Qdrant
 * `PUT /collections` — without that marker — is rejected at ingest time.
 *
 * We still own collection creation here (so both a project's collections exist
 * up front, which the dual-collection chat pipeline reads), but we now create
 * them in the shape RocketRide expects: an unnamed dense Cosine vector plus the
 * schema control document. Its all-zero vector never matches a real query, and
 * `isDeleted: true` marks it as non-content.
 */
export class QdrantCollectionProvisioner {
	/** Point id for the RocketRide schema/control document. Fixed → idempotent. */
	private static readonly SCHEMA_POINT_ID = '5ec0de00-0000-4000-8000-000000000000';

	constructor(
		private readonly baseUrl: string,
		private readonly apiKey?: string
	) {}

	/**
	 * Creates the collection (if absent) and its RocketRide schema control
	 * document. `modelName` is the embedding model RocketRide will write with
	 * (e.g. "text-embedding-3-large") — it is recorded in the control document.
	 */
	async ensureCollection(name: string, denseDimension: number, modelName: string): Promise<void> {
		const createRes = await fetch(new URL(`/collections/${name}`, this.baseUrl), {
			method: 'PUT',
			headers: this.headers(),
			// Dense-only Cosine, matching RocketRide's own collection shape. (The
			// former sparse "text" slot was never populated at ingest and hybrid
			// search already degrades to semantic — dropping it avoids diverging
			// from what RocketRide creates.)
			body: JSON.stringify({ vectors: { size: denseDimension, distance: 'Cosine' } }),
			signal: AbortSignal.timeout(10_000),
		});
		if (!createRes.ok) {
			const body = await createRes.text();
			throw new Error(`Failed to create Qdrant collection "${name}": ${createRes.status} ${body}`);
		}

		await this.upsertSchemaDocument(name, denseDimension, modelName);
	}

	/** Writes the schema control document RocketRide requires before it will ingest. */
	private async upsertSchemaDocument(name: string, denseDimension: number, modelName: string): Promise<void> {
		const res = await fetch(new URL(`/collections/${name}/points?wait=true`, this.baseUrl), {
			method: 'PUT',
			headers: this.headers(),
			body: JSON.stringify({
				points: [
					{
						id: QdrantCollectionProvisioner.SCHEMA_POINT_ID,
						vector: new Array(denseDimension).fill(0),
						payload: {
							content: '',
							meta: { objectId: 'schema', chunkId: 0, isDeleted: true, vectorSize: denseDimension, modelName },
						},
					},
				],
			}),
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Failed to write schema control document for "${name}": ${res.status} ${body}`);
		}
	}

	async deleteCollection(name: string): Promise<void> {
		const res = await fetch(new URL(`/collections/${name}`, this.baseUrl), {
			method: 'DELETE',
			headers: this.headers(),
			signal: AbortSignal.timeout(10_000),
		});

		// 404 is fine — deletion is idempotent from the caller's point of view.
		if (!res.ok && res.status !== 404) {
			const body = await res.text();
			throw new Error(`Failed to delete Qdrant collection "${name}": ${res.status} ${body}`);
		}
	}

	private headers(): Record<string, string> {
		const headers: Record<string, string> = { 'content-type': 'application/json' };
		if (this.apiKey) headers['api-key'] = this.apiKey;
		return headers;
	}
}
