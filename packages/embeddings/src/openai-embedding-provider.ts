import type { EmbeddingProvider } from './embedding-provider.js';

const OPENAI_EMBEDDING_PROFILES = new Set(['text-embedding-3-large', 'text-embedding-3-small', 'text-embedding-ada-002']);

export function isOpenAiEmbeddingProfile(profile: string): boolean {
	return OPENAI_EMBEDDING_PROFILES.has(profile);
}

/** Calls OpenAI's embeddings endpoint via fetch — no SDK, one dependency-free HTTP call. */
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
	constructor(
		readonly profile: string,
		private readonly apiKey: string,
		private readonly baseUrl = 'https://api.openai.com/v1'
	) {}

	async embed(text: string): Promise<number[]> {
		const res = await fetch(`${this.baseUrl}/embeddings`, {
			method: 'POST',
			headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
			body: JSON.stringify({ model: this.profile, input: text }),
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) {
			throw new Error(`OpenAI embeddings request failed: ${res.status} ${await res.text()}`);
		}
		const body = (await res.json()) as { data?: Array<{ embedding: number[] }> };
		const vector = body.data?.[0]?.embedding;
		if (!vector) throw new Error('OpenAI embeddings response contained no embedding');
		return vector;
	}
}
