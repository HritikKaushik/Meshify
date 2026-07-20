/**
 * A minimal `fetch`-shaped port so adapters make no direct global calls and are
 * fully fakeable in unit tests (see `testing/fakes.ts`). The default impl wraps
 * the Node global `fetch` (undici, Node 20+).
 */
export interface LlmHttpResponse {
	status: number;
	ok: boolean;
	json(): Promise<unknown>;
	text(): Promise<string>;
	headers: { get(name: string): string | null };
}

export interface LlmHttpRequestInit {
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	signal?: AbortSignal;
}

export interface LlmHttpClient {
	fetch(url: string, init?: LlmHttpRequestInit): Promise<LlmHttpResponse>;
}

export const defaultLlmHttpClient: LlmHttpClient = {
	async fetch(url, init) {
		const res = await fetch(url, init as RequestInit);
		return {
			status: res.status,
			ok: res.ok,
			json: () => res.json(),
			text: () => res.text(),
			headers: { get: (name: string) => res.headers.get(name) },
		};
	},
};

/**
 * Runs `op` under a timeout, mapping an abort to the caller-supplied timeout
 * error. Adapters use this so a hung provider surfaces as `LlmTimeoutError`
 * rather than an open socket.
 */
export async function withTimeout<T>(timeoutMs: number, op: (signal: AbortSignal) => Promise<T>): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await op(controller.signal);
	} finally {
		clearTimeout(timer);
	}
}
