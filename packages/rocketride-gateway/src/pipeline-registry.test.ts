import { describe, expect, it } from 'vitest';
import { PipelineRegistry, RocketRidePipelineTimeoutError } from './pipeline-registry.js';
import type { RocketRideClientPool } from './client-pool.js';

const GUID = '00000000-0000-4000-8000-000000000001';
const chatConfig = { pipelineGuid: GUID, llm: { provider: 'openai' as const, profile: 'openai-5', apiKeyEnvVar: 'ROCKETRIDE_OPENAI_KEY' } };

/** Builds a pool whose client behaves per the provided overrides. */
function fakePool(client: Partial<{ getTaskToken: () => Promise<string | undefined>; restart: () => Promise<void>; use: () => Promise<{ token: string }> }>): RocketRideClientPool {
	const full = {
		getTaskToken: async () => undefined,
		restart: async () => {},
		use: async () => ({ token: 'tk_ok' }),
		...client,
	};
	return { getClient: async () => full } as unknown as RocketRideClientPool;
}

const never = () => new Promise<never>(() => {}); // hangs forever

describe('PipelineRegistry reconcile + timeout', () => {
	it('starts a fresh pipeline (no reconcile) when nothing is running', async () => {
		const registry = new PipelineRegistry(fakePool({ use: async () => ({ token: 'tk_new' }) }), 200);
		expect(await registry.ensureChatPipeline(chatConfig)).toBe('tk_new');
	});

	it('caches the token — a second ensure does not hit the client', async () => {
		let uses = 0;
		const registry = new PipelineRegistry(fakePool({ use: async () => ({ token: `tk_${++uses}` }) }), 200);
		const first = await registry.ensureChatPipeline(chatConfig);
		const second = await registry.ensureChatPipeline(chatConfig);
		expect(second).toBe(first);
		expect(uses).toBe(1);
	});

	it('restarts the running task to apply the current definition, then returns the token', async () => {
		const calls: string[] = [];
		const registry = new PipelineRegistry(
			fakePool({
				getTaskToken: async () => 'tk_running',
				restart: async () => { calls.push('restart'); },
				use: async () => { calls.push('use'); return { token: 'tk_restarted' }; },
			}),
			200
		);
		expect(await registry.ensureChatPipeline(chatConfig)).toBe('tk_restarted');
		expect(calls).toEqual(['restart', 'use']); // reconcile before reuse
	});

	it('fails fast with a clear timeout error when the engine hangs on restart', async () => {
		const registry = new PipelineRegistry(fakePool({ getTaskToken: async () => 'tk_wedged', restart: never }), 50);
		await expect(registry.ensureChatPipeline(chatConfig)).rejects.toBeInstanceOf(RocketRidePipelineTimeoutError);
	});

	it('fails fast when the engine hangs on pipeline start', async () => {
		const registry = new PipelineRegistry(fakePool({ use: never }), 50);
		await expect(registry.ensureChatPipeline(chatConfig)).rejects.toBeInstanceOf(RocketRidePipelineTimeoutError);
	});
});
