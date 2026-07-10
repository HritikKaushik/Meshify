/**
 * Provisions/tears down Qdrant collections directly via Qdrant's REST API.
 * RocketRide's `qdrant` component only ever points at an existing collection
 * (see ROCKETRIDE_COMPONENT_REFERENCE.md, "Vector DB Nodes: Profile-Based") —
 * it does not create collections — so collection lifecycle is owned here,
 * not by the RocketRide gateway.
 *
 * Collections are created with both a dense vector (the project's embedding
 * model) and a sparse vector ("text") so hybrid (dense + sparse) search is
 * available on every collection from day one — see the confirmed Phase I
 * decision to use Qdrant hybrid search as the single retrieval engine.
 */
export class QdrantCollectionProvisioner {
	constructor(
		private readonly baseUrl: string,
		private readonly apiKey?: string
	) {}

	async ensureCollection(name: string, denseDimension: number): Promise<void> {
		const res = await fetch(new URL(`/collections/${name}`, this.baseUrl), {
			method: 'PUT',
			headers: this.headers(),
			body: JSON.stringify({
				vectors: { size: denseDimension, distance: 'Cosine' },
				sparse_vectors: { text: {} },
			}),
			signal: AbortSignal.timeout(10_000),
		});

		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Failed to create Qdrant collection "${name}": ${res.status} ${body}`);
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
