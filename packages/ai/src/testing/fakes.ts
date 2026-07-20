import type { LlmHttpClient, LlmHttpRequestInit } from '../provider-core/interfaces/transport.js';

export interface FakeResponse {
	status?: number;
	body?: unknown;
	text?: string;
}

export interface RecordedCall {
	url: string;
	init?: LlmHttpRequestInit;
}

/**
 * A fully in-memory `LlmHttpClient` for adapter tests. `handler` decides the
 * response per request; `calls` records every request so tests can assert on the
 * URL, method, and headers an adapter sent.
 */
export function fakeHttpClient(handler: (url: string, init?: LlmHttpRequestInit) => FakeResponse | Promise<FakeResponse>): {
	client: LlmHttpClient;
	calls: RecordedCall[];
} {
	const calls: RecordedCall[] = [];
	const client: LlmHttpClient = {
		async fetch(url, init) {
			calls.push({ url, init });
			const response = await handler(url, init);
			const status = response.status ?? 200;
			return {
				status,
				ok: status >= 200 && status < 300,
				json: async () => response.body ?? {},
				text: async () => response.text ?? JSON.stringify(response.body ?? {}),
				headers: { get: () => null },
			};
		},
	};
	return { client, calls };
}

/** Monotonic fake clock so latency measurements are deterministic. */
export function makeClock(step = 5): () => number {
	let now = 1_000;
	return () => (now += step);
}
