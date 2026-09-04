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

	/**
	 * Payload fields the search client filters and deletes on (see
	 * qdrant-search.client.ts). Without an index every filtered query and every
	 * targeted delete (re-ingest of a changed file, document removal) scans the
	 * whole collection.
	 */
	static readonly PAYLOAD_INDEXES: ReadonlyArray<{ field: string; schema: string }> = [
		{ field: 'language', schema: 'keyword' },
		{ field: 'parent_type', schema: 'keyword' },
		{ field: 'meta.parent', schema: 'keyword' },
	];

	constructor(
		private readonly baseUrl: string,
		private readonly apiKey?: string
	) {}

	/**
	 * Creates the collection (if absent), its RocketRide schema control document
	 * and the payload indexes. Idempotent: an existing collection is kept (a
	 * retried project create, or a replay after a partial failure, must not
	 * fail on "already exists"), the control document has a fixed id, and only
	 * missing indexes are created. `modelName` is the embedding model RocketRide
	 * will write with (e.g. "text-embedding-3-large") — it is recorded in the
	 * control document.
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
			// Qdrant answers 409 (older releases: 400 "already exists") for a collection that is already there.
			const alreadyExists = createRes.status === 409 || (createRes.status === 400 && /already exists/i.test(body));
			if (!alreadyExists) throw new Error(`Failed to create Qdrant collection "${name}": ${createRes.status} ${body}`);
		}

		await this.upsertSchemaDocument(name, denseDimension, modelName);
		await this.ensurePayloadIndexes(name);
	}

	/**
	 * Creates whichever of PAYLOAD_INDEXES the collection lacks. Returns the
	 * fields created (empty when everything was already in place), or
	 * undefined when the collection does not exist - a project's code
	 * collection is only provisioned when the project has one.
	 */
	async ensurePayloadIndexes(name: string): Promise<string[] | undefined> {
		const infoRes = await fetch(new URL(`/collections/${name}`, this.baseUrl), { headers: this.headers(), signal: AbortSignal.timeout(10_000) });
		if (infoRes.status === 404) return undefined;
		if (!infoRes.ok) throw new Error(`Failed to read Qdrant collection "${name}": ${infoRes.status} ${await infoRes.text()}`);
		const info = (await infoRes.json()) as { result?: { payload_schema?: Record<string, unknown> } };
		const existing = new Set(Object.keys(info.result?.payload_schema ?? {}));

		const created: string[] = [];
		for (const index of QdrantCollectionProvisioner.PAYLOAD_INDEXES) {
			if (existing.has(index.field)) continue;
			const res = await fetch(new URL(`/collections/${name}/index?wait=true`, this.baseUrl), {
				method: 'PUT',
				headers: this.headers(),
				body: JSON.stringify({ field_name: index.field, field_schema: index.schema }),
				signal: AbortSignal.timeout(30_000),
			});
			if (!res.ok) throw new Error(`Failed to create payload index "${index.field}" on "${name}": ${res.status} ${await res.text()}`);
			created.push(index.field);
		}
		return created;
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
