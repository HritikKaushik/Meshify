import { describe, expect, it } from 'vitest';
import { PipelineRegistry, RocketRidePipelineTimeoutError } from './pipeline-registry.js';
import type { RocketRideClientPool } from './client-pool.js';
import type { ChatPipelineConfig } from './pipeline-builder/types.js';

const GUID = '00000000-0000-4000-8000-000000000001';
const GUID2 = '00000000-0000-4000-8000-000000000002';
const openaiConfig: ChatPipelineConfig = { pipelineGuid: GUID, llm: { provider: 'openai', profile: 'openai-5', apiKeyEnvVar: 'K' } };
const geminiConfig: ChatPipelineConfig = { pipelineGuid: GUID, llm: { provider: 'gemini', profile: 'gemini-2_0-flash', apiKeyEnvVar: 'K' } };
const tick = () => new Promise((r) => setTimeout(r, 5));

function fakePool(client: Partial<{ getTaskToken: () => Promise<string | undefined>; restart: () => Promise<void>; use: () => Promise<{ token: string }> }>): RocketRideClientPool {
	const full = { getTaskToken: async () => undefined, restart: async () => {}, use: async () => ({ token: 'tk_ok' }), ...client };
	return { getClient: async () => full } as unknown as RocketRideClientPool;
}

const never = () => new Promise<never>(() => {}); // hangs forever

describe('PipelineRegistry', () => {
	it('starts a fresh pipeline (no reconcile) when nothing is running', async () => {
		const registry = new PipelineRegistry(fakePool({ use: async () => ({ token: 'tk_new' }) }), 200);
		expect(await registry.ensureChatPipeline(openaiConfig)).toBe('tk_new');
	});

	it('caches the token — a second ensure with the same config does not hit the client', async () => {
		let uses = 0;
		const registry = new PipelineRegistry(fakePool({ use: async () => ({ token: `tk_${++uses}` }) }), 200);
		const first = await registry.ensureChatPipeline(openaiConfig);
		expect(await registry.ensureChatPipeline(openaiConfig)).toBe(first);
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
		expect(await registry.ensureChatPipeline(openaiConfig)).toBe('tk_restarted');
		expect(calls).toEqual(['restart', 'use']); // reconcile before reuse
	});

	it('reconciles again on a provider switch (definition change), not a stale cache hit', async () => {
		let uses = 0;
		const registry = new PipelineRegistry(fakePool({ getTaskToken: async () => 'tk_run', use: async () => ({ token: `tk_${++uses}` }) }), 200);
		const a = await registry.ensureChatPipeline(openaiConfig);
		const b = await registry.ensureChatPipeline(geminiConfig); // switch openai → gemini
		expect(uses).toBe(2); // the switch triggered a fresh reconcile
		expect(b).not.toBe(a);
		// switching back to openai reconciles again (definition differs from the now-cached gemini)
		await registry.ensureChatPipeline(openaiConfig);
		expect(uses).toBe(3);
	});

	it('dedupes concurrent ensures for the same pipeline into ONE reconcile (warm-vs-chat race)', async () => {
		let uses = 0;
		const registry = new PipelineRegistry(fakePool({ use: async () => { await tick(); return { token: `tk_${++uses}` }; } }), 500);
		const [a, b] = await Promise.all([registry.ensureChatPipeline(openaiConfig), registry.ensureChatPipeline(openaiConfig)]);
		expect(a).toBe(b);
		expect(uses).toBe(1); // the second joined via the post-lock cache re-check — no concurrent restart/use
	});

	it('serializes reconciles across pipelines — never two lifecycle ops on the shared client at once', async () => {
		let active = 0;
		let maxActive = 0;
		const track = async () => { active++; maxActive = Math.max(maxActive, active); await tick(); active--; };
		const registry = new PipelineRegistry(
			fakePool({ getTaskToken: async () => 'tk_run', restart: track, use: async () => { await track(); return { token: `tk_${GUID}` }; } }),
			500
		);
		await Promise.all([
			registry.ensureChatPipeline(openaiConfig),
			registry.ensureChatPipeline({ pipelineGuid: GUID2, llm: openaiConfig.llm }), // different pipeline/key
		]);
		expect(maxActive).toBe(1); // the single shared connection is never used concurrently
	});

	it('fails fast with a clear timeout error when the engine hangs on restart', async () => {
		const registry = new PipelineRegistry(fakePool({ getTaskToken: async () => 'tk_wedged', restart: never }), 50);
		await expect(registry.ensureChatPipeline(openaiConfig)).rejects.toBeInstanceOf(RocketRidePipelineTimeoutError);
	});

	it('fails fast when the engine hangs on pipeline start', async () => {
		const registry = new PipelineRegistry(fakePool({ use: never }), 50);
		await expect(registry.ensureChatPipeline(openaiConfig)).rejects.toBeInstanceOf(RocketRidePipelineTimeoutError);
	});
});
